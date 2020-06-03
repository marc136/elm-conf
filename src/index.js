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
  elm.ports.incoming.send(json);
}

elm.ports.out.subscribe(msg => {
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
      const pcConfig = {
        iceServers: [
          { urls: ['stun:stun.services.mozilla.com'] },
          // { urls: ['stun:stun.l.google.com:19302'] },
        ]
      };
      const pc = new RTCPeerConnection(pcConfig)
      const peerId = msg.for
      pc.onnegotiationneeded = async () => {
        try {
          console.debug("pc.onnegotiationneeded");
          await pc.setLocalDescription(await pc.createOffer());
          const data = {
            type: 'offer', for: peerId,
            sdp: pc.localDescription.sdp
          };
          console.warn('toElm', data);
          toElm(data);
          toServer(data);
        } catch (err) {
          console.error('onnegotiationneeded failure', err);
        }
      };

      pc.onicecandidate = async ({ candidate }) => {
        console.debug(`Got ICE candidate for peer ${peerId}`);
        const data = { type: 'ice-candidate', for: peerId, candidate };
        toElm(data);
        toServer(data);
      }

      for (const track of msg.localStream.getTracks()) {
        pc.addTrack(track, msg.localStream);
      }
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
