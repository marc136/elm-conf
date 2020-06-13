import './main.css';
import { Elm } from './Main.elm';
import * as serviceWorker from './serviceWorker';


/**
 * Returns media constraints
 * https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
 */
function defaultConstraints() {
  return {
    audio: {},
    video: {
      width: { min: 160, ideal: 320 },
      height: { min: 120, ideal: 240 },
    },
    facingMode: 'user',
  }
}

const webRtcSupport = {
  peerConnection: !!window.RTCPeerConnection,
  getUserMedia: typeof navigator.mediaDevices.getUserMedia === 'function'
};
const supportsWebRtc = webRtcSupport.peerConnection && webRtcSupport.getUserMedia;


const state = {
  ws: undefined // TODO remove this
};

class CameraSelect extends HTMLElement {
  // follows https://davidea.st/articles/simple-camera-component

  constructor() {
    super();
  }

  connectedCallback() {
    console.log('CameraSelect connected')
    // attach a shadow root so nobody can mess with your styles
    // requires additional effort for emitting the custom events
    // const shadow = this.attachShadow({ mode: "open" });

    this.textElement = document.createTextNode("Init");
    this.appendChild(this.textElement);

    this.videoElement = addVideoElement(this)
    this.videoElement.classList.add('hidden');

    this.audioInput = document.createElement('p');
    this.audioInput.textContent = "Audio";
    this.audioInputSelect = this.audioInput.appendChild(document.createElement('select'));
    this.appendChild(this.audioInput);
    this.videoInput = document.createElement('p');
    this.videoInput.textContent = "Video";
    this.videoInputSelect = this.videoInput.appendChild(document.createElement('select'));
    this.appendChild(this.videoInput);

    this.selectors = [this.audioInputSelect, this.videoInputSelect];
    this.selectors.forEach(el => {
      el.classList.add('hidden');
      this.appendChild(el);
      el.onchange = this.getUserMedia.bind(this);
    });

    requestAnimationFrame(() => {
      this.getUserMedia()
    });
  }

  async getUserMedia() {
    this.textElement.textContent = 'Requesting access to camera and microphone.';
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }

    const constraints = defaultConstraints();
    if (this.audioInputSelect.value) {
      constraints.audio.deviceId = { exact: this.audioInputSelect.value };
    }
    if (this.videoInputSelect.value) {
      constraints.video.deviceId = { exact: this.videoInputSelect.value };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.debug('getUserMedia success', stream);
      this.videoElement.srcObject = stream;
      this.videoElement.classList.remove('hidden');
      this.textElement.textContent = '';
      this.dispatchEvent(new CustomEvent('got-stream', { detail: { stream }, bubbles: true }));
      this.stream = stream;
    }
    catch (reason) {
      this.videoElement.classList.add('hidden');
      console.error('getUserMedia failed', reason);
      this.textElement.textContent = "Error: " + (reason.message || reason.name);
    }

    this.enumerateDevices().catch(reason => {
      console.warn('Could not enumberate media devices', reason);
    });
  }

  async enumerateDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    console.debug('media devices', devices);
    // Handles being called several times to update labels. Preserve values.
    const values = this.selectors.map(select => select.value);
    this.selectors.forEach(select => {
      while (select.firstChild) {
        select.removeChild(select.firstChild);
      }
    });

    for (const device of devices) {
      const option = document.createElement('option');
      option.value = device.deviceId;
      switch (device.kind) {
        case 'audioinput':
          option.text = device.label || `microphone ${this.audioInputSelect.length + 1}`;
          this.audioInputSelect.appendChild(option);
          break;
        case 'videoinput':
          option.text = device.label || `camera ${this.videoInputSelect.length + 1}`;
          this.videoInputSelect.appendChild(option);
          break;
        default:
          console.debug('Another media device:', device);
      }

      this.selectors.forEach((select, index) => {
        if (Array.prototype.slice.call(select.childNodes).some(n => n.value === values[index])) {
          select.value = values[index];
        }
        select.classList.remove('hidden');
      });
    }
  }

  _retryGetUserMediaButton() {
    const btn = document.createElement('button');
    btn.className = 'circle';
    btn.style.cssText = 'position: absolute; right: 5px; top: 5px;';
    btn.type = 'button';
    btn.innerHTML = '<svg class="feather" viewBox="0 0 24 24" style="color:white;">' +
      // '<use xlink:href="./feather-sprite.svg#circle"/>' +
      '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>' +
      '</svg>';
    this.appendChild(btn);
    btn.addEventListener('click', (evt) => {
      evt.preventDefault();
      this._getUserMedia(defaultConstraints());
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

function addVideoElement(container) {
  const video = document.createElement("video");
  video.muted = true;
  // will be blocked on some browsers if our stream contains audio and video and it is not muted
  video.autoplay = true;
  // https://css-tricks.com/what-does-playsinline-mean-in-web-video/
  video.setAttribute("playsinline", true);
  container.appendChild(video);
  return video;
}


class WebRtcMedia extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    console.log('WebRtcMedia connected')
    // attach a shadow root so nobody can mess with your styles
    // const shadow = this.attachShadow({ mode: "open" });

    const video = addVideoElement(this);
    this.videoElement = video;
    video.classList.remove('hidden');
    const audio = document.createElement('audio');
    audio.autoplay = true;
    this.audioElement = audio;

    video.controls = true; // TODO remove
    audio.controls = true; // TODO remove

    this.appendChild(this.audioElement);
    this._addPeerConnectionEventListeners();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    console.error(`attributeChanged "${name}"`, { oldValue, newValue });
  }

  static get observedAttributes() {
    return ['has-media', 'has-video', 'has-audio'];
  }

  _addPeerConnectionEventListeners() {
    this.pc.ontrack = ({ track, streams }) => {
      console.log(`ontrack for ${this.id}`, track, this);
      this._playTrack(track);
    };
  }

  _playTrack(track) {
    const el = this[track.kind + 'Element'];
    if (!el) {
      console.error(`could not play ${track.kind} track because media element was not found`, track);
    }
    this.setAttribute('has-' + track.kind, true);

    console.warn('_playTrack', this.id, track);
    track.onunmute = () => {
      console.log(`track.onunmute for ${this.id}`, track);
      el.srcObject = new MediaStream([track]);
    };
    if (adapter.browserDetails.browser === 'safari') {
      console.log(`${track.kind} ${this.id} srcObject was set directly because safari does not trigger track.onunmute`);
      el.srcObject = new MediaStream([track]);
    }
  }
}
customElements.define('webrtc-media', WebRtcMedia);


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
