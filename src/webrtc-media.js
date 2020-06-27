export default class WebRtcMedia extends HTMLElement {
  constructor() {
    super();

    // create the audio and video element here because the remote stream might arrive before the
    // element is connected to the DOM (e.g. if the page is not in the foreground in Chrome)
    const video = document.createElement("video");
    video.muted = true;
    // will be blocked on some browsers if our stream contains audio and video and it is not muted
    video.autoplay = true;
    // https://css-tricks.com/what-does-playsinline-mean-in-web-video/
    video.setAttribute("playsinline", true);
    this.videoElement = video;

    const audio = document.createElement('audio');
    audio.autoplay = true;
    this.audioElement = audio;
  }

  connectedCallback() {
    console.log('WebRtcMedia connected')
    // attach a shadow root so nobody can mess with your styles
    // const shadow = this.attachShadow({ mode: "open" });

    this.appendChild(this.videoElement);
    this.videoElement.classList.remove('hidden');
    this.appendChild(this.audioElement);

    this.videoElement.controls = true; // TODO remove
    this.audioElement.controls = true; // TODO remove

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
