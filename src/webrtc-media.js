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

    if (typeof this.pc.createAndPropagateAnswer === 'function') {
      delete pc.createAndPropagateAnswer;
      this.pc.createAndPropagateAnswer();
    } else {
      this.pc.createAndPropagateAnswer = true;
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

    console.debug('_playTrack', this.id, track);

    // it looks better if the video element is only shown if frames are received (-> not muted),
    // but safari does not trigger the `onunmute` event
    if (!track.muted || adapter.browserDetails.browser === 'safari') {
      console.log(`${track.kind} ${this.id} srcObject was set directly`);
      el.srcObject = new MediaStream([track]);
      this.setAttribute('has-' + track.kind, true);
    } else {
      track.onunmute = () => {
        console.log(`track ${track.kind} onunmute for ${this.id}`);
        el.srcObject = new MediaStream([track]);
        this.setAttribute('has-' + track.kind, true);
      };
    }
  }
}
customElements.define('webrtc-media', WebRtcMedia);
