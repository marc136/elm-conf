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


export default class CameraSelect extends HTMLElement {
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

    this.videoElement = document.createElement("video");
    this.videoElement.muted = true;
    this.videoElement.autoplay = true;
    // https://css-tricks.com/what-does-playsinline-mean-in-web-video/
    this.videoElement.setAttribute("playsinline", true);
    this.videoElement.classList.add('hidden');
    this.appendChild(this.videoElement);

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
  }

  static get observedAttributes() {
    return [];
  }
}
customElements.define('camera-select', CameraSelect);