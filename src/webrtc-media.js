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

    // TODO don't set this immediately
    this.pc = new RTCPeerConnection(pcConfig);
    addDevEventHandlers(this.id, this.pc);

    this._addPeerConnectionEventListeners();

    this._emitEvent('new-peer-connection', this.pc);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    console.log(`attributeChanged "${name}" for ${this.id}`, { oldValue, newValue });
  }

  static get observedAttributes() {
    return ['has-media', 'has-video', 'has-audio', 'view'];
  }

  _addPeerConnectionEventListeners() {
    const receivers = this.pc.getReceivers();
    if (receivers.length > 0) {
      // the ontrack event was already emitted and we missed it. We will trigger _playTrack directly
      // this happens e.g. if the page was in the background
      receivers.forEach(receiver => {
        console.log(`faking ontrack for ${this.id}`, this);
        this._playTrack(receiver.track);
      });
    } else {
      this.pc.ontrack = ({ track, streams }) => {
        console.log(`ontrack for ${this.id}`, track, this);
        this._playTrack(track);
      };
    }
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
    if (webrtc.pc.connectionState !== 'connected') {
      // It would be better to listen to the individual events instead
      // https://www.w3.org/TR/2019/CR-webrtc-20191213/#event-summary
      stats.init(webrtc.pc, info);
    } else {
      // return stats.fullReport(webrtc.pc, el);
      await stats.connected(webrtc.pc, webrtc.stats, info);
    }
    setTimeout(() => { peerConnectionInfo(webrtc, info); }, 1000);
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
