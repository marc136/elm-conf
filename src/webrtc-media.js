import icon from './icons.js';
import * as stats from './webrtc-stats.js';

let debug = false;

// See https://developer.mozilla.org/de/docs/Web/API/RTCConfiguration
const pcConfig = {
  iceServers: [
    { urls: ['stun:stun.services.mozilla.com'] },
    // { urls: ['stun:stun.l.google.com:19302'] },
  ]
};

export default class WebRtcMedia extends HTMLElement {
  constructor() {
    super();

    // create the audio and video element here because the remote stream might arrive before the
    // element is connected to the DOM (e.g. if the page is not in the foreground in Chrome)
    const video = document.createElement("video");
    video.muted = true;
    video.autoplay = true;
    // https://css-tricks.com/what-does-playsinline-mean-in-web-video/
    video.setAttribute("playsinline", true);
    this.videoElement = video;

    ['playing', 'stalled'].forEach(event => {
      this.videoElement.addEventListener(event, () => {
        console.log(new Date().toISOString(), `${event} event for ${this.id}`);
        this._emitEvent('video', event);
      });
    })

    this.loadingElement = icon('refresh-cw');
    this.loadingElement.classList.add('connecting-animation')

    this.infoElement = document.createElement('pre');
    this.infoElement.classList.add('info');

    const audio = document.createElement('audio');
    audio.autoplay = true;
    this.audioElement = audio;

    /** @type {GatheredStats} */
    this.stats = { last: undefined, inbound: [], outbound: [] };
  }

  connectedCallback() {
    if (!this.isConnected) {
      console.warn('WebRtcMedia connectedCallback/1 was executed after it was removed from DOM');
      return;
    }
    console.log('WebRtcMedia connected')
    // attach a shadow root so nobody can mess with your styles
    // const shadow = this.attachShadow({ mode: "open" });
    this.appendChild(this.loadingElement);

    this.appendChild(this.videoElement);
    this.videoElement.classList.remove('hidden');
    this.appendChild(this.audioElement);

    if (debug) {
      this.audioElement.controls = true;
      this.videoElement.controls = true;
    }
    this.appendChild(this.infoElement);
    requestAnimationFrame(() => { peerConnectionInfo(this, this.infoElement); });

    this._createPeerConnection();
  }

  static get observedAttributes() {
    return ['action', 'view'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    console.debug(`attributeChanged "${name}" for ${this.id}`, { oldValue, newValue });
    switch (name) {
      case 'action':
        switch (newValue) {
          case 'create-peer-connection':
            if (this.isConnected) {
              this._createPeerConnection();
            } else {
              console.debug(`Did not create a peer connection for ${this.id} because the element is not connected`);
            }
            break;
        }
        break;
    }
  }

  _createPeerConnection() {
    console.error('creating peer connection', this.id)
    const pc = new RTCPeerConnection(pcConfig);
    console.warn('after create, remoteDescription is', pc.remoteDescription)
    addDevEventHandlers(this.id, pc);
    pc.ontrack = ({ track, streams }) => {
      console.log(`ontrack for ${this.id}`, track, this);
      this._playTrack(track);
    };
    this._emitEvent('new-peer-connection', pc);

    pc.onconnectionstatechange = () => {
      console.log(`dev user-${this.id} onconnectionstatechange`, pc.connectionState);
      switch (pc.connectionState) {
        case 'failed':
          this._emitEvent('connection-failed');
          this.classList.add('failed');
          break;
        default:
          this.classList.remove('failed');
      }
    };
  }

  /**
   * Play the media track in the corresponding media element
   * @param {MediaStreamTrack} track
   */
  _playTrack(track) {
    const el = this[track.kind + 'Element'];
    if (!el) {
      console.error(`Could not play ${track.kind} track because media element was not found`, track);
    }

    const setTrack = (log) => {
      console.log(`${track.kind} ${this.id} ${log}`);
      el.srcObject = new MediaStream([track]);
      // this.setAttribute('has-' + track.kind, true);
      this._emitEvent('track', { kind: track.kind, track });
    }

    console.debug('_playTrack', this.id, track);

    // it looks better if the video element is only shown if frames are received (-> not muted),
    // but safari does not trigger the `onunmute` event
    if (!track.muted || adapter.browserDetails.browser === 'safari') {
      setTrack('srcObject was set directly');
    } else {
      track.onunmute = () => {
        track.onunmute = null;
        setTrack('onunmute event set srcObject');
      };
    }
  }

  _emitEvent(name, detail = null) {
    requestAnimationFrame(() => {
       this.dispatchEvent(new CustomEvent(name, {
        bubbles: true,
        composed: true, // allows to break out of the Shadow DOM
        detail
      }));
    });
  }
}
customElements.define('webrtc-media', WebRtcMedia);


/**
 * @param {WebRtcMedia} webrtc
 * @param {HTMLElement} info
 */
async function peerConnectionInfo(webrtc, info) {
  try {
    let timeout = 1000;
    if (webrtc.pc) {
      if (webrtc.pc.connectionState !== 'connected') {
        // It would be better to listen to the individual events instead
        // https://www.w3.org/TR/2019/CR-webrtc-20191213/#event-summary
        stats.init(webrtc.pc, info);
        timeout = 100;
      } else {
        // return stats.fullReport(webrtc.pc, el);
        await stats.connected(webrtc.pc, webrtc.stats, info);
      }
    }
    setTimeout(() => { peerConnectionInfo(webrtc, info); }, timeout);
  } catch (ex) {
    console.error('peerConnectionInfo failed', ex)
    info.textContent = 'failed to get stats'
  }
}


/**
 * @param {string} userId
 * @param {RTCPeerConnection} pc
 */
function addDevEventHandlers(userId, pc) {
  // const node = document.querySelector(`webrtc-media#user-${userId}`);
  // console.warn('webrtc-media user node', node);

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
    console.warn(`user-${userId} pc.ontrack was triggered before the custom element was connected`, track);
  };
}
