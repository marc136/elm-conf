import './main.css';
import { Elm } from './Main.elm';
import * as serviceWorker from './serviceWorker';


const defaultConstraints = { audio: true, video: true, facingMode: 'user' };
const webRtcSupport = {
  peerConnection: !!window.RTCPeerConnection,
  getUserMedia: typeof navigator.mediaDevices.getUserMedia === 'function'
};
const supportsWebRtc = webRtcSupport.peerConnection && webRtcSupport.getUserMedia;


const state = {
  localStream: undefined,
  ws: undefined
};

class CameraSelect extends HTMLElement {
  // follows https://davidea.st/articles/simple-camera-component

  // things required by Custom Elements
  constructor() {
    super();
  }

  connectedCallback() {
    console.log('CameraSelect connected')
    // attach a shadow root so nobody can mess with your styles
    // const shadow = this.attachShadow({ mode: "open" });

    const video = document.createElement("video");
    // usually don't want to hear ourselves
    video.muted = true;
    // will be blocked on some browsers if our stream contains audio and video and it is not muted
    video.autoplay = true;
    // https://css-tricks.com/what-does-playsinline-mean-in-web-video/
    video.setAttribute("playsinline", true);
    this.videoElement = video;

    this.appendChild(this.videoElement);

    navigator.mediaDevices.getUserMedia(defaultConstraints)
      .then(stream => {
        state.localStream = stream;
        this.videoElement.srcObject = stream;

        // this.videoElement.onloadedmetadata = (e) => {
        //   this.videoElement.play();
        // };
        this.dispatchEvent(new CustomEvent('got-stream', { detail: { stream }, bubbles: true }))
      });
  }

  attributeChangedCallback() {
    console.log('attributesChanged', arguments);
    // this.setTextContent();
  }

  // static get observedAttributes() {
  //   return ['lang', 'year', 'month'];
  // }
}
customElements.define('camera-select', CameraSelect);


const elm = Elm.Main.init({
  node: document.getElementById('root'),
  flags: {
    supportsWebRtc,
    browser: adapter.browserDetails.browser,
    browserVersion: adapter.browserDetails.version
  }
});

function toServer(json) {
  state.ws.send(JSON.stringify(json));
}

function toElm(json) {
  console.debug('toElm', json);
  elm.ports.incoming.send(json);
}

// See https://developer.mozilla.org/de/docs/Web/API/RTCConfiguration
const pcConfig = {
  iceServers: [
    { urls: ['stun:stun.services.mozilla.com'] },
    // { urls: ['stun:stun.l.google.com:19302'] },
  ]
};

elm.ports.out.subscribe(async msg => {
  console.warn('got from elm', msg);

  switch (msg.type) {
    case 'getUserMedia':
      console.error('todo: implement getUserMedia');
      break;

    case 'releaseUserMedia':
      stopStream(msg.stream);
      break;

    case 'attachStreamToId':
      requestAnimationFrame(() => {
        const video = document.getElementById(msg.id)
        if (video && video.tagName == 'VIDEO') {
          video.srcObject = msg.stream;
        } else {
          console.warn(`Could not find video element with id #${msg.id}`, video);
        }
      })
      break;

    case 'join':
      state.ws = connectToRoom(msg.room);
      break;

    case 'createSdpOffer':
      initiateSdpOffer(msg.for, msg.localStream);
      break;

    case 'createSdpAnswer':
      receiveSdpOffer(msg.offer, msg.from, msg.localStream, msg.ws);
      break;

    case 'setRemoteSdpAnswer':
      msg.pc.setRemoteDescription(msg.answer)
        .then(() => {
          console.debug('Successfully set remote SDP answer', msg);
        })
        .catch(ex => {
          console.error('could not set remote SDP answer', ex, msg);
        })
      break;

    case 'setRemoteIceCandidate':
      msg.pc.addIceCandidate(msg.candidate)
        .then(() => {
          console.debug('Successfully set remote ICE candidate', msg);
        })
        .catch(ex => {
          console.error('could not set remote ICE candidate', ex, msg);
        })
      break;

    default:
      console.warn('Unsupported elm msg:', msg)
  }
})

function stopStream(stream) {
  if (stream && typeof stream.getTracks === 'function') {
    stream.getTracks().forEach(track => {
      track.stop();
    });
  }
}

/**
 * @param {number} peerId
 * @param {MediaStream} localStream
 */
async function initiateSdpOffer(peerId, localStream) {
  const pc = new RTCPeerConnection(pcConfig);
  addDevEventHandlers(peerId, pc);
  toElm({ type: 'peerConnection', for: peerId, pc });
  pc.onicecandidate = propagateLocalIceCandidates(peerId);

  pc.onnegotiationneeded = async () => {
    try {
      console.debug("pc.onnegotiationneeded");
      await pc.setLocalDescription(await pc.createOffer());
      const data = { type: 'offer', for: peerId, sdp: pc.localDescription.sdp };
      toServer(data);
      data.pc = pc;
      toElm(data);
    } catch (err) {
      console.error('onnegotiationneeded failure', err);
    }
  };

  addLocalStream(pc, localStream);
}

/**
 * @param {RTCSessionDescription} sdp
 * @param {number} from
 * @param {MediaStream} localStream
 * @param {WebSocket} ws
 */
async function receiveSdpOffer(sdp, from, localStream, ws) {
  const pc = new RTCPeerConnection(pcConfig);
  toElm({ type: 'peerConnection', for: from, pc });
  addDevEventHandlers(from, pc);
  pc.onicecandidate = propagateLocalIceCandidates(from, ws);

  await pc.setRemoteDescription(sdp);
  addLocalStream(pc, localStream);

  const answer = await pc.createAnswer()
  toElm({ type: 'answer', for: from, sdp: answer.sdp });
  await pc.setLocalDescription(answer);
  toServer({ type: 'answer', for: from, sdp: answer.sdp });
}

/**
 * @param {number} peerId
 * @param {WebSocket} ws
 */
function propagateLocalIceCandidates(peerId, ws) {
  return ({ candidate }) => {
    console.debug(`Found local ICE candidate for peer ${peerId}`);
    const data = { type: 'ice-candidate', for: peerId, candidate };
    // toElm(data);
    toServer(data);
  };
}

/**
 * @param {RTCPeerConnection} pc
 * @param {MediaStream} stream
 */
function addLocalStream(pc, stream) {
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
  }
}

function connectToRoom(roomId) {
  const ws = new WebSocket('ws://localhost:8443/join/123123')
  ws.onopen = evt => {
    console.log('socket was opened');
    state.ws = ws;
    toServer({
      type: 'initial',
      supportsWebRtc,
      browser: adapter.browserDetails.browser,
      browserVersion: adapter.browserDetails.version
    });
  };

  ws.onmessage = async evt => {
    const msg = getMsg(evt.data);
    console.debug('got msg', msg);
    msg.socket = ws;
    toElm(msg);
  };

  ws.onclose = evt => {
    console.log('socket closed', evt);
  };

  return ws;
}


function getMsg(data) {
  try {
    const json = JSON.parse(data)
    return json
  } catch (error) {
    return data
  }
}

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();


/**
 *
 * @param {RTCPeerConnection} pc
 */
function addDevEventHandlers(userId, pc) {
  pc.oniceconnectionstatechange = () => {
    console.log(`User ${userId} oniceconnectionstatechange`, pc.iceConnectionState);
  };

  pc.onsignalingtatechange = () => {
    console.log(`User ${userId} onsignalingtatechange`, pc.signalingState);
  };

  pc.onconnectionstatechange = () => {
    console.log(`User ${userId} onconnectionstatechange`, pc.connectionState);
  };

  pc.ontrack = ({ track, streams }) => {
    console.log(`ontrack for user ${userId}`, track);
    // once media for a remote track arrives, show it in the remote video element
    track.onunmute = () => {
      console.log(`track.onunmute for user ${userId}`, track);

      // don't set srcObject again if it is already set.
      // if (remoteView.srcObject) return;
      // remoteView.srcObject = streams[0];

    };
  };
}