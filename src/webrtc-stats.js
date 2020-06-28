/**
 * Module to abstract away the WebRTC getStats API
 * https://www.w3.org/TR/2020/CR-webrtc-stats-20200114/#rtctatstype-*
 *
 * @typedef GatheredStats
 * @type {object}
 * @property {Stats} last
 * @property {TracksStats[]} inbound
 * @property {TracksStats[]} outbound
 *
 * @typedef Stats
 * @type {object}
 * @property {TracksStats} outbound
 * @property {TracksStats} inbound
 *
 * @typedef TracksStats
 * @type {object}
 * @property {TrackStats} audio
 * @property {TrackStats} video
 *
 * @typedef TrackStats
 * @type {object}
 * @property {number} bytes
 */


/**
 * Displays stats about the connection initialization.
 * Useful for debugging if connection establishment fails.
 * @param {RTCPeerConnection} pc
 * @param {HTMLElement} el
 */
export function init(pc, el) {
  // It would be better to listen to the individual events instead
  // https://www.w3.org/TR/2019/CR-webrtc-20191213/#event-summary
  const lines = [
    // SDP offer/answer state (anything but `stable` or `closed` is very unexpected)
    // https://www.w3.org/TR/2019/CR-webrtc-20191213/#rtcsignalingstate-enum
    `SDP signaling: ${pc.signalingState}`,
    // https://www.w3.org/TR/2019/CR-webrtc-20191213/#rtcicegatheringstate-enum
    `ICE gathering: ${pc.iceGatheringState}`,
    // https://www.w3.org/TR/2019/CR-webrtc-20191213/#rtciceconnectionstate-enum
    `ICE connection: ${pc.iceConnectionState}`,
    // https://www.w3.org/TR/2019/CR-webrtc-20191213/#rtcpeerconnectionstate-enum
    `connection: ${pc.connectionState}`
  ];
  el.textContent = lines.join('\n');
}

/**
 * Displays stats about the connection inside the given HTML element.
 * @param {RTCPeerConnection} pc
 * @param {GatheredStats} stats
 * @param {HTMLElement} el
 */
export async function connected(pc, stats, el) {
  const current = await getStats(pc, el);
  if (stats.last) {
    keepLastFewDiffs(stats, current);
    printBytes(stats, el);
  }
  stats.last = current;
}

/**
 * @param {GatheredStats} stats
 * @param {Stats} current
 * @param {number} amount
 */
function keepLastFewDiffs(stats, current, amount = 10) {
  for (const direction in current) {
    const diff = {};
    for (const kind in current[direction]) {
      const bytes = current[direction][kind].bytes - stats.last[direction][kind].bytes;
      diff[kind] = { bytes };
    }

    stats[direction].push(diff);
    while (stats[direction].length > amount) {
      stats[direction].splice(0, 1);
    }
  }
}

function printBytes(stats, el) {
  el.textContent = [
    `↑ ${getAverageInKbitps(stats.outbound).toFixed(1)}Kbit/s`,
    `↓ ${getAverageInKbitps(stats.inbound).toFixed(1)}Kbit/s`
  ].join('\n');
}

/**
 * @param {TracksStats} stats
 */
function getAverageInKbitps(stats) {
  let sum = 0;
  for (const stat of stats) {
    sum += stat.audio.bytes + stat.video.bytes
  }
  return (sum / (stats.length || 1)) / 125;
}

/**
 * @returns {Stats}
 */
function emptyStats() {
  return {
    inbound: { audio: { bytes: 0 }, video: { bytes: 0 }},
    outbound: { audio: { bytes: 0 }, video: { bytes: 0 }},
  }
}

/**
 * Returns bytes sent and received
 * See https://www.w3.org/TR/2020/CR-webrtc-stats-20200114/#rtcstatstype-str*
 * @param {RTCPeerConnection} pc
 */
async function getStats(pc) {
  const result = emptyStats();
  const stats = await pc.getStats(null)
  stats.forEach(report => {
    let stat, bytes;
    switch (report.type) {
      case 'inbound-rtp':
        stat = result.inbound;
        bytes = report.bytesReceived;
        break;
      case 'outbound-rtp':
        stat = result.outbound;
        bytes = report.bytesSent;
        break;
      default:
        return;
    }

    const kind = report.kind || report.mediaType || 'unknown';
    if (!stat[kind]) {
      console.warn(`Added kind "${kind}" for this stats report`, report);
    }
    stat[kind] = { bytes };
  });
  return result;
}

/**
 * Prints all stats, see https://www.w3.org/TR/2020/CR-webrtc-stats-20200114/#rtcstatstype-str*
 * @param {RTCPeerConnection} pc
 * @param {HTMLElement} el
 */
export async function fullReport(pc, el) {
  const stats = await pc.getStats(null)
  let statsOutput = "";

  stats.forEach(report => {
    statsOutput += `<h2>Report: ${report.type}</h3>\n<strong>ID:</strong> ${report.id}<br>\n` +
                    `<strong>Timestamp:</strong> ${report.timestamp}<br>\n`;

    // Now the statistics for this report; we intentially drop the ones we
    // sorted to the top above

    Object.keys(report).forEach(statName => {
      if (statName !== "id" && statName !== "timestamp" && statName !== "type") {
        statsOutput += `<strong>${statName}:</strong> ${report[statName]}<br>\n`;
      }
    });
  });

  el.innerHTML = statsOutput;
}
