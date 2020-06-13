import './main.css';
import { Elm } from './Main.elm';
import * as serviceWorker from './serviceWorker';

// import custom elements
import './camera-select.js';
import './webrtc-media.js';

const webRtcSupport = {
  peerConnection: !!window.RTCPeerConnection,
  getUserMedia: navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'
};
const supportsWebRtc = webRtcSupport.peerConnection && webRtcSupport.getUserMedia || false;

const state = {
  ws: undefined // TODO remove this
};

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
    case 'disconnect':
      state.ws.close(1000, "User left conference");
      break;

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

    case 'closeRemotePeerConnection':
      closePeerConnection(msg.pc);
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
  const address = `ws://${location.hostname}:8443/join/123123`;
  console.log('Will connect to', address);
  const ws = new WebSocket(address);
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

/**
 * @param {RTCPeerConnection} pc
 */
function closePeerConnection(pc) {
  pc.oniceconnectionstatechange = null;
  pc.onsignalingtatechange = null;
  pc.onconnectionstatechange = null;
  pc.close()
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
  const node = document.querySelector(`webrtc-media#user-${userId}`);
  console.warn('node', node);

  pc.oniceconnectionstatechange = () => {
    console.log(`dev user-${userId} oniceconnectionstatechange`, pc.iceConnectionState);
  };

  pc.onsignalingtatechange = () => {
    console.log(`dev user-${userId} onsignalingtatechange`, pc.signalingState);
  };

  pc.onconnectionstatechange = () => {
    console.log(`dev user-${userId} onconnectionstatechange`, pc.connectionState);
  };

  pc.ontrack = ({ track, streams }) => {
    // Buggy behavior in Chrome 83:
    // `onConnectedCallback` is not triggered inside a background tab and the tracks will not be attached.
    // This can e.g. be fixed by only creating a new peer connection when the page is visible
    // https://developer.mozilla.org/de/docs/Web/API/Page_Visibility_API
    console.error(`user-${userId} pc.ontrack was triggered before the custom element was connected`, track);
  };
}
