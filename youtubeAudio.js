/**
 * YouTube Audio Track Extractor, Selector, and Streamer
 * 
 * Cung cấp:
 * - Phân tích stream data từ YouTube URL / Video ID
 * - Trích xuất danh sách audio track khả dụng cùng metadata chuẩn hoá
 * - Lựa chọn audio track theo tiêu chí (ngôn ngữ, bitrate, codec)
 * - Cơ chế fallback tự động an toàn về audio mặc định
 * - Streaming audio độc lập hỗ trợ HTTP Range requests (206 Partial Content)
 * - Tùy chọn ghép stream video + audio thông qua ffmpeg
 */

const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const { URL } = require('url');

// Mã lỗi định danh
const ERROR_CODES = {
  ERR_INVALID_YOUTUBE_URL: 'ERR_INVALID_YOUTUBE_URL',
  ERR_NO_AUDIO_TRACKS: 'ERR_NO_AUDIO_TRACKS',
  ERR_INCOMPLETE_METADATA: 'ERR_INCOMPLETE_METADATA',
  ERR_EXPIRED_OR_INVALID_STREAM_URL: 'ERR_EXPIRED_OR_INVALID_STREAM_URL',
  ERR_YOUTUBE_API_FAILED: 'ERR_YOUTUBE_API_FAILED'
};

class YouTubeAudioError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'YouTubeAudioError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Trích xuất Video ID từ URL YouTube hoặc chuỗi ID trực tiếp
 * Hỗ trợ các định dạng:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - VIDEO_ID (11 ký tự alphanumeric, dấu gạch ngang, gạch dưới)
 */
function extractVideoId(urlOrId) {
  if (!urlOrId || typeof urlOrId !== 'string') {
    throw new YouTubeAudioError(
      ERROR_CODES.ERR_INVALID_YOUTUBE_URL,
      'URL hoặc Video ID không được để trống'
    );
  }

  const trimmed = urlOrId.trim();

  // Kiểm tra nếu đã là Video ID trực tiếp (thường là 11 ký tự)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Phân tích URL
  const patterns = [
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/i,
    /^[a-zA-Z0-9_-]{11}$/
  ];

  for (const regex of patterns) {
    const match = trimmed.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }

  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const v = parsed.searchParams.get('v');
    if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
      return v;
    }
  } catch (e) {
    // Bỏ qua lỗi parse URL
  }

  throw new YouTubeAudioError(
    ERROR_CODES.ERR_INVALID_YOUTUBE_URL,
    `Không thể trích xuất YouTube Video ID từ: "${urlOrId}"`
  );
}

/**
 * Gửi HTTP POST request tới Innertube API
 */
function requestInnertube(videoId, clientConfig) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      videoId,
      context: {
        client: {
          hl: 'en',
          gl: 'US',
          ...clientConfig
        }
      }
    });

    const req = https.request({
      hostname: 'www.youtube.com',
      path: '/youtubei/v1/player',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'User-Agent': clientConfig.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          resolve(json);
        } catch (err) {
          reject(new YouTubeAudioError(
            ERROR_CODES.ERR_YOUTUBE_API_FAILED,
            `Lỗi parse JSON từ YouTube API: ${err.message}`
          ));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new YouTubeAudioError(
        ERROR_CODES.ERR_YOUTUBE_API_FAILED,
        'Yêu cầu tới YouTube Innertube API bị timeout'
      ));
    });

    req.on('error', (err) => {
      reject(new YouTubeAudioError(
        ERROR_CODES.ERR_YOUTUBE_API_FAILED,
        `Lỗi kết nối YouTube API: ${err.message}`
      ));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Trích xuất timestamp hết hạn từ stream URL
 */
function extractExpiration(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const expireParam = parsed.searchParams.get('expire');
    if (expireParam) {
      const expSec = parseInt(expireParam, 10);
      return !isNaN(expSec) ? expSec * 1000 : null;
    }
  } catch (e) {
    // Bỏ qua lỗi URL
  }
  return null;
}

/**
 * Kiểm tra xem stream URL có hết hạn hay không
 */
function isStreamUrlExpired(url, skewSeconds = 30) {
  if (!url || typeof url !== 'string') return true;
  const expiresAt = extractExpiration(url);
  if (!expiresAt) return false; // Không có expire param, giả sử hợp lệ
  const now = Date.now();
  // Hết hạn nếu hiện tại vượt qua thời điểm hết hạn trừ đi skew
  return now >= (expiresAt - (skewSeconds * 1000));
}

/**
 * Chuẩn hoá thông tin của một audio format từ YouTube
 */
function parseAudioFormat(format, index, totalTracks) {
  if (!format || !format.mimeType) return null;

  // Trích xuất mime type gốc và codec
  // Ví dụ: audio/mp4; codecs="mp4a.40.2" hoặc audio/webm; codecs="opus"
  const mimeType = format.mimeType;
  let codec = 'unknown';
  let container = 'unknown';

  const containerMatch = mimeType.match(/^audio\/([a-zA-Z0-9_-]+)/i);
  if (containerMatch) {
    container = containerMatch[1].toLowerCase();
  }

  const codecMatch = mimeType.match(/codecs=["']?([^"']+)["']?/i);
  if (codecMatch) {
    codec = codecMatch[1].toLowerCase();
  } else if (container === 'webm') {
    codec = 'opus';
  } else if (container === 'mp4') {
    codec = 'mp4a.40.2';
  }

  // Bitrate tính bằng bps và kbps
  const bitrate = format.bitrate || format.averageBitrate || 0;
  const bitrateKbps = Math.round(bitrate / 1000);

  // Thông tin ngôn ngữ từ audioTrack nếu có (đa ngôn ngữ)
  let language = null;
  let languageName = null;
  let isDefault = false;

  if (format.audioTrack) {
    language = format.audioTrack.id ? format.audioTrack.id.split('.')[0] : null;
    languageName = format.audioTrack.displayName || null;
    isDefault = !!format.audioTrack.audioIsDefault;
  } else {
    // Nếu không có audioTrack riêng biệt, track đầu tiên hoặc itag 140/251 là mặc định
    if (format.itag === 140 || (index === 0 && !isDefault)) {
      isDefault = true;
    }
  }

  // Tên hiển thị thân thiện cho UI
  let displayName = languageName;
  if (!displayName) {
    const qualityLabel = bitrateKbps >= 128 ? 'Cao' : (bitrateKbps >= 64 ? 'Trung bình' : 'Tiết kiệm');
    displayName = `${qualityLabel} • ${bitrateKbps} kbps (${codec})`;
  } else {
    displayName = `${languageName} (${bitrateKbps} kbps, ${codec})`;
  }

  const expiresAt = extractExpiration(format.url);

  return {
    id: `${format.itag}${format.audioTrack?.id ? `-${format.audioTrack.id}` : ''}`,
    itag: format.itag,
    bitrate: bitrate,
    bitrateKbps: bitrateKbps,
    codec: codec,
    mimeType: mimeType,
    container: container,
    audioSampleRate: format.audioSampleRate ? parseInt(format.audioSampleRate, 10) : null,
    audioChannels: format.audioChannels || 2,
    audioQuality: format.audioQuality || 'AUDIO_QUALITY_UNKNOWN',
    language: language,
    languageName: languageName,
    displayName: displayName,
    isDefault: isDefault,
    url: format.url || null,
    contentLength: format.contentLength ? parseInt(format.contentLength, 10) : null,
    approxDurationMs: format.approxDurationMs ? parseInt(format.approxDurationMs, 10) : null,
    expiresAt: expiresAt,
    isExpired: Boolean(format.url && isStreamUrlExpired(format.url))
  };
}

/**
 * Phân tích danh sách audio tracks từ YouTube streaming data
 */
function parseAudioTracksFromStreamingData(streamingData, videoDetails = {}) {
  if (!streamingData) {
    throw new YouTubeAudioError(
      ERROR_CODES.ERR_NO_AUDIO_TRACKS,
      'Dữ liệu streaming không chứa định dạng video/audio'
    );
  }

  const allFormats = [
    ...(streamingData.adaptiveFormats || []),
    ...(streamingData.formats || [])
  ];

  const audioFormats = allFormats.filter(f => f && f.mimeType && f.mimeType.startsWith('audio/'));

  if (audioFormats.length === 0) {
    throw new YouTubeAudioError(
      ERROR_CODES.ERR_NO_AUDIO_TRACKS,
      'Video không có audio track khả dụng'
    );
  }

  const tracks = [];
  for (let i = 0; i < audioFormats.length; i++) {
    const parsed = parseAudioFormat(audioFormats[i], i, audioFormats.length);
    if (parsed) {
      // Kiểm tra tính toàn vẹn cơ bản của metadata
      if (!parsed.itag || !parsed.mimeType || !parsed.bitrate) {
        // Ghi nhận cảnh báo metadata không đầy đủ nhưng không làm gián đoạn các track khác
        continue;
      }
      tracks.push(parsed);
    }
  }

  if (tracks.length === 0) {
    throw new YouTubeAudioError(
      ERROR_CODES.ERR_INCOMPLETE_METADATA,
      'Không thể trích xuất metadata hợp lệ cho bất kỳ audio track nào'
    );
  }

  // Sắp xếp tracks: track mặc định trước, sau đó theo bitrate giảm dần
  tracks.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return b.bitrate - a.bitrate;
  });

  // Đảm bảo ít nhất 1 track có isDefault = true
  if (!tracks.some(t => t.isDefault)) {
    tracks[0].isDefault = true;
  }

  // Nếu video có nhiều audio tracks ngôn ngữ khác nhau (ví dụ video MrBeast),
  // nhóm theo từng ngôn ngữ và lấy format có bitrate tốt nhất cho mỗi ngôn ngữ
  const hasMultiAudio = tracks.some(t => t.languageName || t.language);
  let displayTracks = tracks;
  if (hasMultiAudio) {
    const langMap = new Map();
    for (const t of tracks) {
      const key = t.language || t.languageName || 'default';
      if (!langMap.has(key)) {
        langMap.set(key, t);
      } else {
        const existing = langMap.get(key);
        if (t.isDefault && !existing.isDefault) {
          langMap.set(key, t);
        } else if (t.bitrate > existing.bitrate && (!existing.isDefault || t.isDefault)) {
          langMap.set(key, t);
        }
      }
    }
    displayTracks = Array.from(langMap.values());
    displayTracks.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return (a.displayName || '').localeCompare(b.displayName || '');
    });
  }

  return {
    videoId: videoDetails.videoId || null,
    title: videoDetails.title || null,
    author: videoDetails.author || null,
    durationSeconds: videoDetails.lengthSeconds ? parseInt(videoDetails.lengthSeconds, 10) : null,
    defaultTrackId: (displayTracks.find(t => t.isDefault) || tracks.find(t => t.isDefault) || tracks[0]).id,
    tracksCount: displayTracks.length,
    tracks: displayTracks,
    allFormats: tracks
  };
}

/**
 * Cào dữ liệu player từ trang YouTube Watch Page (phương án dự phòng đáng tin cậy)
 */
function fetchFromWatchPage(videoId) {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8'
      },
      timeout: 10000
    }, (res) => {
      let html = '';
      res.on('data', chunk => html += chunk);
      res.on('end', () => {
        try {
          const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
          if (!match) {
            return reject(new YouTubeAudioError(
              ERROR_CODES.ERR_NO_AUDIO_TRACKS,
              'Không tìm thấy dữ liệu player trong trang YouTube'
            ));
          }
          const json = JSON.parse(match[1]);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', (err) => {
      reject(new YouTubeAudioError(
        ERROR_CODES.ERR_YOUTUBE_API_FAILED,
        `Lỗi khi tải trang YouTube: ${err.message}`
      ));
    });
    req.on('timeout', () => {
      req.destroy();
      reject(new YouTubeAudioError(
        ERROR_CODES.ERR_YOUTUBE_API_FAILED,
        'Tải trang YouTube bị timeout'
      ));
    });
  });
}

const LANGUAGE_NAMES = {
  'vi': 'Tiếng Việt',
  'en': 'Tiếng Anh',
  'ja': 'Tiếng Nhật',
  'ko': 'Tiếng Hàn',
  'zh': 'Tiếng Trung',
  'zh-Hans': 'Tiếng Trung (giản thể)',
  'zh-Hant': 'Tiếng Trung (phồn thể)',
  'es': 'Tiếng Tây Ban Nha',
  'fr': 'Tiếng Pháp',
  'de': 'Tiếng Đức',
  'ru': 'Tiếng Nga',
  'th': 'Tiếng Thái',
  'id': 'Tiếng Indonesia',
  'hi': 'Tiếng Hindi',
  'ar': 'Tiếng Ả Rập',
  'pt': 'Tiếng Bồ Đào Nha',
  'it': 'Tiếng Ý',
  'tr': 'Tiếng Thổ Nhĩ Kỳ',
  'pl': 'Tiếng Ba Lan',
  'bn': 'Tiếng Bengali',
  'ta': 'Tiếng Tamil',
  'te': 'Tiếng Telugu',
  'ml': 'Tiếng Malayalam'
};

/**
 * Thực thi lệnh yt-dlp với cơ chế fallback linh hoạt và cờ tối ưu
 */
function executeYtDlp(customArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const { execFile } = require('child_process');
    const fs = require('fs');
    const path = require('path');

    const baseArgs = ['--no-cache-dir', '--no-warnings'];

    // Hỗ trợ file cookies.txt nếu có trong thư mục ứng dụng
    const cookiePath = path.join(__dirname, 'cookies.txt');
    if (fs.existsSync(cookiePath)) {
      baseArgs.push('--cookies', cookiePath);
    }

    const fullArgs = [...baseArgs, ...customArgs];

    const extraDirs = [
      '/usr/local/bin',
      '/usr/bin',
      '/bin',
      '/home/nodejs/.local/bin',
      process.env.HOME ? `${process.env.HOME}/.local/bin` : '',
      process.env.HOME ? `${process.env.HOME}/Library/Python/3.14/bin` : '',
      process.env.HOME ? `${process.env.HOME}/Library/Python/3.11/bin` : ''
    ].filter(Boolean);

    const fullPath = `${extraDirs.join(':')}:${process.env.PATH || ''}`;

    const execOpts = {
      maxBuffer: options.maxBuffer || 30 * 1024 * 1024,
      timeout: options.timeout || 35000,
      env: {
        ...process.env,
        PATH: fullPath,
        HOME: process.env.HOME || '/home/nodejs',
        PYTHONUNBUFFERED: '1'
      }
    };

    // Thử chạy trực tiếp binary 'yt-dlp'
    execFile('yt-dlp', fullArgs, execOpts, (err, stdout, stderr) => {
      if (!err && stdout && stdout.trim().length > 0) {
        return resolve({ stdout, stderr });
      }

      // Fallback sang python3 -m yt_dlp
      const pythonArgs = ['-m', 'yt_dlp', ...fullArgs];
      execFile('python3', pythonArgs, execOpts, (pyErr, pyStdout, pyStderr) => {
        if (!pyErr && pyStdout && pyStdout.trim().length > 0) {
          return resolve({ stdout: pyStdout, stderr: pyStderr });
        }
        reject(pyErr || err || new Error(pyStderr || stderr || 'Không thể thực thi yt-dlp'));
      });
    });
  });
}

/**
 * Strategy C: Sử dụng yt-dlp để trích xuất danh sách audio track (đặc biệt hiệu quả trên cloud VPS/AWS)
 */
async function extractViaYtDlp(videoId) {
  const { stdout } = await executeYtDlp(['-J', '--skip-download', `https://www.youtube.com/watch?v=${videoId}`], {
    maxBuffer: 30 * 1024 * 1024,
    timeout: 35000
  });

  const info = JSON.parse(stdout);
  const rawFormats = (info.formats || []).filter(f => (f.vcodec === 'none' || !f.vcodec) && (f.acodec && f.acodec !== 'none'));
  if (!rawFormats.length) {
    throw new YouTubeAudioError(ERROR_CODES.ERR_NO_AUDIO_TRACKS, 'Không tìm thấy audio formats');
  }

  const tracks = [];
  for (let i = 0; i < rawFormats.length; i++) {
    const f = rawFormats[i];
    const itag = parseInt(f.format_id.split('-')[0], 10) || 140;
    const mimeType = f.mimeType || `audio/${f.ext || 'webm'}; codecs="${f.acodec}"`;
    const codec = f.acodec || (f.ext === 'webm' ? 'opus' : 'mp4a.40.2');
    const bitrate = f.tbr ? Math.round(f.tbr * 1000) : (f.abr ? Math.round(f.abr * 1000) : 128000);
    const bitrateKbps = Math.round(bitrate / 1000);
    const lang = f.language || (f.format_note && f.format_note.includes('original') ? 'en' : null);

    let friendlyLangName = LANGUAGE_NAMES[lang] || f.format_note || lang;
    if (f.format_note && f.format_note.includes('original')) {
      friendlyLangName = `${LANGUAGE_NAMES[lang] || 'Tiếng Anh'} gốc`;
    }
    const isDefault = Boolean(f.format_note && f.format_note.includes('default')) || (i === 0);

    let displayName = friendlyLangName;
    if (!displayName) {
      const qualityLabel = bitrateKbps >= 128 ? 'Cao' : (bitrateKbps >= 64 ? 'Trung bình' : 'Tiết kiệm');
      displayName = `${qualityLabel} • ${bitrateKbps} kbps (${codec})`;
    } else {
      displayName = `${friendlyLangName} (${bitrateKbps} kbps, ${codec})`;
    }

    const trackId = `${itag}-${lang || i}`;
    tracks.push({
      id: trackId,
      itag: itag,
      bitrate: bitrate,
      bitrateKbps: bitrateKbps,
      codec: codec,
      mimeType: mimeType,
      container: f.ext || 'webm',
      audioSampleRate: f.asr || 48000,
      audioChannels: f.audio_channels || 2,
      audioQuality: bitrateKbps >= 128 ? 'AUDIO_QUALITY_MEDIUM' : 'AUDIO_QUALITY_LOW',
      language: lang,
      languageName: friendlyLangName,
      displayName: displayName,
      isDefault: isDefault,
      url: f.url && f.url.startsWith('http') ? f.url : null,
      contentLength: f.filesize || f.filesize_approx || null,
      approxDurationMs: info.duration ? Math.round(info.duration * 1000) : null,
      expiresAt: f.url ? extractExpiration(f.url) : null,
      isExpired: Boolean(f.url && isStreamUrlExpired(f.url))
    });
  }

  const hasMultiAudio = tracks.some(t => t.languageName || t.language);
  let displayTracks = tracks;
  if (hasMultiAudio) {
    const langMap = new Map();
    for (const t of tracks) {
      const key = t.language || t.languageName || 'default';
      if (!langMap.has(key)) {
        langMap.set(key, t);
      } else {
        const existing = langMap.get(key);
        if (t.isDefault && !existing.isDefault) {
          langMap.set(key, t);
        } else if (t.bitrate > existing.bitrate && (!existing.isDefault || t.isDefault)) {
          langMap.set(key, t);
        }
      }
    }
    displayTracks = Array.from(langMap.values());
    displayTracks.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return (a.displayName || '').localeCompare(b.displayName || '');
    });
  }

  return {
    videoId: videoId,
    title: info.title || null,
    author: info.uploader || info.channel || null,
    durationSeconds: info.duration || null,
    defaultTrackId: (displayTracks.find(t => t.isDefault) || displayTracks[0]).id,
    tracksCount: displayTracks.length,
    tracks: displayTracks,
    allFormats: tracks
  };
}

/**
 * Trích xuất danh sách audio track từ YouTube URL hoặc Video ID
 */
async function extractAudioTracks(urlOrId) {
  const videoId = extractVideoId(urlOrId);

  // Strategy A: Thử với Innertube API
  const clientConfigs = [
    { clientName: 'ANDROID_VR', clientVersion: '1.60.19' },
    { clientName: 'ANDROID', clientVersion: '19.43.41', androidSdkVersion: 34 },
    { clientName: 'WEB', clientVersion: '2.20240101.00.00' }
  ];

  for (const config of clientConfigs) {
    try {
      const response = await requestInnertube(videoId, config);
      if (response && response.playabilityStatus?.status === 'OK' && response.streamingData) {
        const result = parseAudioTracksFromStreamingData(
          response.streamingData,
          response.videoDetails || { videoId }
        );
        if (result && result.tracks.length > 0) {
          return result;
        }
      }
    } catch (err) {
      // Tiếp tục thử client khác
    }
  }

  // Strategy B: Fallback cào dữ liệu từ trang YouTube watch page
  try {
    const watchPageData = await fetchFromWatchPage(videoId);
    if (watchPageData && watchPageData.streamingData) {
      const result = parseAudioTracksFromStreamingData(
        watchPageData.streamingData,
        watchPageData.videoDetails || { videoId }
      );
      if (result && result.tracks.length > 0) {
        return result;
      }
    }
  } catch (err) {
    // Watch page scraper bị hạn chế trên một số IP Cloud
  }

  // Strategy C: Fallback qua yt-dlp (đặc biệt tin cậy trên Server / Cloud IP)
  let lastError = null;
  try {
    const ytDlpResult = await extractViaYtDlp(videoId);
    if (ytDlpResult && ytDlpResult.tracks && ytDlpResult.tracks.length > 0) {
      return ytDlpResult;
    }
  } catch (err) {
    lastError = err;
    console.warn(`[audio-tracks] Strategy C (yt-dlp) thất bại: ${err.message}`);
  }

  throw new YouTubeAudioError(
    ERROR_CODES.ERR_NO_AUDIO_TRACKS,
    `Không tìm thấy audio tracks cho video ID: ${videoId}${lastError ? ` - Lỗi yt-dlp: ${lastError.message}` : ''}`
  );
}

/**
 * Lựa chọn audio track dựa trên các tiêu chí lọc với cơ chế tự động fallback
 * 
 * Criteria:
 * - trackId: ID của track mong muốn
 * - itag: itag mong muốn (e.g. 140, 251)
 * - language: mã ngôn ngữ mong muốn (e.g. 'vi', 'en')
 * - codec: codec ưu tiên (e.g. 'opus', 'mp4a', 'aac')
 * - quality: 'highest' | 'lowest' | 'medium' | bitrate số cụ thể
 */
function selectAudioTrack(tracks, criteria = {}) {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    throw new YouTubeAudioError(
      ERROR_CODES.ERR_NO_AUDIO_TRACKS,
      'Danh sách audio tracks rỗng hoặc không hợp lệ'
    );
  }

  const defaultTrack = tracks.find(t => t.isDefault && !t.isExpired) 
                    || tracks.find(t => t.isDefault) 
                    || tracks[0];

  // 1. Nếu chỉ định trackId cụ thể
  if (criteria.trackId) {
    const match = tracks.find(t => t.id === criteria.trackId);
    if (match && !match.isExpired) {
      return {
        selectedTrack: match,
        fallbackApplied: false,
        reason: 'Khớp chính xác trackId yêu cầu'
      };
    }
  }

  // 2. Nếu chỉ định itag cụ thể
  if (criteria.itag) {
    const targetItag = parseInt(criteria.itag, 10);
    const match = tracks.find(t => t.itag === targetItag);
    if (match && !match.isExpired) {
      return {
        selectedTrack: match,
        fallbackApplied: false,
        reason: 'Khớp chính xác itag yêu cầu'
      };
    }
  }

  // 3. Lọc theo danh sách ứng viên hợp lệ
  let candidates = tracks.filter(t => !t.isExpired);
  if (candidates.length === 0) {
    candidates = [...tracks]; // Nếu tất cả đều coi như expired theo skew, nới lỏng
  }

  let fallbackApplied = false;
  let fallbackReasons = [];

  if (criteria.trackId) {
    fallbackApplied = true;
    fallbackReasons.push(`trackId "${criteria.trackId}" không khả dụng`);
  }

  if (criteria.itag && !tracks.some(t => t.itag === parseInt(criteria.itag, 10) && !t.isExpired)) {
    fallbackApplied = true;
    fallbackReasons.push(`itag "${criteria.itag}" không khả dụng`);
  }

  // Lọc theo ngôn ngữ nếu có
  if (criteria.language) {
    const langNormalized = criteria.language.toLowerCase();
    const langMatches = candidates.filter(t => 
      t.language && t.language.toLowerCase() === langNormalized
    );
    if (langMatches.length > 0) {
      candidates = langMatches;
    } else {
      fallbackApplied = true;
      fallbackReasons.push(`ngôn ngữ "${criteria.language}" không khả dụng`);
    }
  }

  // Lọc theo codec nếu có
  if (criteria.codec) {
    const codecNormalized = criteria.codec.toLowerCase();
    const codecMatches = candidates.filter(t => 
      t.codec && t.codec.toLowerCase().includes(codecNormalized)
    );
    if (codecMatches.length > 0) {
      candidates = codecMatches;
    } else {
      fallbackApplied = true;
      fallbackReasons.push(`codec "${criteria.codec}" không khả dụng`);
    }
  }

  // Sắp xếp theo chất lượng / bitrate
  if (candidates.length > 0) {
    let selected = null;
    let reason = '';

    if (criteria.quality === 'lowest') {
      candidates.sort((a, b) => a.bitrate - b.bitrate);
      selected = candidates[0];
      reason = 'Chọn chất lượng tiết kiệm nhất (lowest bitrate)';
    } else if (criteria.quality === 'medium') {
      candidates.sort((a, b) => Math.abs(a.bitrateKbps - 96) - Math.abs(b.bitrateKbps - 96));
      selected = candidates[0];
      reason = 'Chọn chất lượng trung bình';
    } else if (typeof criteria.quality === 'number') {
      const targetBps = criteria.quality > 1000 ? criteria.quality : criteria.quality * 1000;
      candidates.sort((a, b) => Math.abs(a.bitrate - targetBps) - Math.abs(b.bitrate - targetBps));
      selected = candidates[0];
      reason = `Chọn track gần với bitrate ${targetBps} bps nhất`;
    } else {
      candidates.sort((a, b) => b.bitrate - a.bitrate);
      selected = candidates[0];
      reason = 'Chọn track có bitrate cao nhất';
    }

    if (fallbackApplied) {
      reason = `Tự động fallback (${fallbackReasons.join(', ')}): ${reason}`;
    }

    return {
      selectedTrack: selected,
      fallbackApplied: fallbackApplied,
      reason: reason
    };
  }

  // 4. Fallback an toàn về track mặc định
  return {
    selectedTrack: defaultTrack,
    fallbackApplied: true,
    reason: 'Không tìm thấy track phù hợp với tiêu chí, đã tự động fallback về audio mặc định'
  };
}

// In-memory cache cho resolved stream URLs
// Key: `${videoId}:${trackKey}` -> { url, expiresAt, resolvedAt }
const resolvedStreamCache = new Map();

/**
 * Phân giải direct GoogleVideo stream URL cho audio track (sử dụng yt-dlp và cache in-memory)
 * Đảm bảo các video có nhiều track âm thanh (như MrBeast) có thể stream mượt mà
 */
function resolveAudioStreamUrl(urlOrId, options = {}) {
  const videoId = extractVideoId(urlOrId);
  const selectedTrack = options.selectedTrack || null;
  const language = options.language || (selectedTrack && selectedTrack.language) || null;
  const trackId = options.trackId || (selectedTrack && selectedTrack.id) || null;
  const itag = options.itag || (selectedTrack && selectedTrack.itag) || null;

  // 1. Nếu track đã có sẵn URL hợp lệ chưa hết hạn, trả về ngay
  if (options.url && !isStreamUrlExpired(options.url)) {
    return Promise.resolve(options.url);
  }
  if (selectedTrack && selectedTrack.url && !isStreamUrlExpired(selectedTrack.url)) {
    return Promise.resolve(selectedTrack.url);
  }

  // 2. Kiểm tra cache
  const cacheKey = `${videoId}:${trackId || language || itag || 'default'}`;
  const cached = resolvedStreamCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.url && cached.expiresAt > (now + 60000)) {
    return Promise.resolve(cached.url);
  }

  // 3. Sử dụng yt-dlp để lấy GoogleVideo URL trực tiếp
  return new Promise((resolve, reject) => {
    let targetLang = language;
    if (!targetLang && trackId) {
      const m = trackId.match(/-([a-zA-Z]{2,3}(?:-[a-zA-Z0-9]+)?)\./);
      if (m) {
        targetLang = m[1];
      }
    }

    let formatSpec = 'bestaudio/ba';
    if (targetLang) {
      formatSpec = `bestaudio[language=${targetLang}]/ba[language=${targetLang}]/bestaudio/ba`;
    }

    executeYtDlp(['-g', '-f', formatSpec, `https://www.youtube.com/watch?v=${videoId}`], { timeout: 25000 })
      .then(({ stdout }) => {
        const urls = (stdout || '').trim().split('\n').filter(l => l.startsWith('http'));
        if (!urls.length) {
          throw new Error('yt-dlp không trả về URL audio stream hợp lệ');
        }
        const resolvedUrl = urls[urls.length - 1].trim();
        const exp = extractExpiration(resolvedUrl) || (Date.now() + 4 * 3600 * 1000);
        resolvedStreamCache.set(cacheKey, { url: resolvedUrl, expiresAt: exp, resolvedAt: Date.now() });
        resolve(resolvedUrl);
      })
      .catch((err) => {
        // Nếu chọn format theo language bị lỗi, thử lại với bestaudio chung
        if (formatSpec !== 'bestaudio/ba') {
          return executeYtDlp(['-g', '-f', 'bestaudio/ba', `https://www.youtube.com/watch?v=${videoId}`], { timeout: 25000 })
            .then(({ stdout: stdout2 }) => {
              const urls = (stdout2 || '').trim().split('\n').filter(l => l.startsWith('http'));
              if (!urls.length) {
                return reject(new YouTubeAudioError(
                  ERROR_CODES.ERR_NO_AUDIO_TRACKS,
                  'yt-dlp không trả về URL audio stream hợp lệ'
                ));
              }
              const resolvedUrl = urls[urls.length - 1].trim();
              const exp = extractExpiration(resolvedUrl) || (Date.now() + 4 * 3600 * 1000);
              resolvedStreamCache.set(cacheKey, { url: resolvedUrl, expiresAt: exp, resolvedAt: Date.now() });
              resolve(resolvedUrl);
            })
            .catch(reject);
        }
        reject(new YouTubeAudioError(
          ERROR_CODES.ERR_NO_AUDIO_TRACKS,
          `Không thể trích xuất stream audio: ${err.message}`
        ));
      });
  });
}

/**
 * Proxy stream audio trực tiếp từ GoogleVideo URL hỗ trợ HTTP 206 Partial Content (Range requests)
 */
function streamAudioTrack(sourceUrl, req, res, redirectCount = 0) {
  if (!sourceUrl || isStreamUrlExpired(sourceUrl)) {
    res.status(410).json({
      error: 'URL audio stream đã hết hạn hoặc không hợp lệ',
      code: ERROR_CODES.ERR_EXPIRED_OR_INVALID_STREAM_URL
    });
    return;
  }

  if (redirectCount > 3) {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Quá nhiều redirect khi tải audio stream' });
    }
    return;
  }

  const range = req.headers.range;
  const requestHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': '*/*'
  };

  if (range) {
    requestHeaders['Range'] = range;
  }

  const parsedUrl = new URL(sourceUrl);
  const clientLib = parsedUrl.protocol === 'https:' ? https : http;

  const streamReq = clientLib.get(sourceUrl, { headers: requestHeaders }, (streamRes) => {
    // Xử lý HTTP Redirects (301, 302, 303, 307, 308)
    if (streamRes.statusCode >= 300 && streamRes.statusCode < 400 && streamRes.headers.location) {
      return streamAudioTrack(streamRes.headers.location, req, res, redirectCount + 1);
    }

    // Chuyển tiếp status code (200 hoặc 206 Partial Content)
    res.status(streamRes.statusCode);

    // Chuyển tiếp headers quan trọng
    const forwardHeaders = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'cache-control'
    ];

    forwardHeaders.forEach(h => {
      if (streamRes.headers[h]) {
        res.setHeader(h, streamRes.headers[h]);
      }
    });

    // Cho phép CORS để browser player phát mượt
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Accept');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

    streamRes.pipe(res);

    streamRes.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Lỗi khi truyền tải audio stream', details: err.message });
      }
    });
  });

  streamReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Không thể kết nối đến nguồn audio stream', details: err.message });
    }
  });

  req.on('close', () => {
    streamReq.destroy();
  });
}

/**
 * Ghép video stream và audio stream thông qua ffmpeg thành một stream đầu ra
 */
function mergeAudioVideoStreams(videoUrl, audioUrl, res) {
  if (!videoUrl || !audioUrl) {
    res.status(400).json({ error: 'Thiếu videoUrl hoặc audioUrl để ghép stream' });
    return;
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Khởi chạy ffmpeg để ghép stream mà không cần re-encode (copy codec)
  const ffmpeg = spawn('ffmpeg', [
    '-re',
    '-i', videoUrl,
    '-i', audioUrl,
    '-c:v', 'copy',
    '-c:a', 'copy',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-f', 'mp4',
    'pipe:1'
  ]);

  ffmpeg.stdout.pipe(res);

  ffmpeg.stderr.on('data', (data) => {
    // ffmpeg log output
  });

  ffmpeg.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ error: `Lỗi ffmpeg: ${err.message}` });
    }
  });

  res.on('close', () => {
    ffmpeg.kill('SIGKILL');
  });
}

module.exports = {
  ERROR_CODES,
  YouTubeAudioError,
  extractVideoId,
  extractAudioTracks,
  selectAudioTrack,
  parseAudioFormat,
  parseAudioTracksFromStreamingData,
  isStreamUrlExpired,
  resolveAudioStreamUrl,
  streamAudioTrack,
  mergeAudioVideoStreams,
  executeYtDlp
};
