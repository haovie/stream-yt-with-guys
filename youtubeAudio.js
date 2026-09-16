const https = require('https');
const http = require('http');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// Cache audio tracks and direct URLs in memory with TTL (15 minutes)
const trackCache = new Map(); // videoId -> { tracks, timestamp }
const streamUrlCache = new Map(); // `${videoId}_${trackId}` -> { url, expiresAt }
const CACHE_TTL_MS = 15 * 60 * 1000;

// Mapping of language codes to Vietnamese readable names
const LANGUAGE_NAMES = {
    'vi': 'Tiếng Việt',
    'en': 'Tiếng Anh',
    'en-US': 'Tiếng Anh (Mỹ)',
    'en-GB': 'Tiếng Anh (Anh)',
    'es': 'Tiếng Tây Ban Nha',
    'es-419': 'Tiếng Tây Ban Nha (Mỹ Latin)',
    'es-ES': 'Tiếng Tây Ban Nha (Tây Ban Nha)',
    'ja': 'Tiếng Nhật',
    'ko': 'Tiếng Hàn',
    'zh': 'Tiếng Trung',
    'zh-Hans': 'Tiếng Trung (Giản thể)',
    'zh-Hant': 'Tiếng Trung (Phồn thể)',
    'zh-TW': 'Tiếng Trung (Đài Loan)',
    'zh-HK': 'Tiếng Trung (Hồng Kông)',
    'de': 'Tiếng Đức',
    'fr': 'Tiếng Pháp',
    'ru': 'Tiếng Nga',
    'it': 'Tiếng Ý',
    'pt': 'Tiếng Bồ Đào Nha',
    'pt-BR': 'Tiếng Bồ Đào Nha (Brazil)',
    'id': 'Tiếng Indonesia',
    'th': 'Tiếng Thái',
    'hi': 'Tiếng Hindi',
    'ar': 'Tiếng Ả Rập',
    'pl': 'Tiếng Ba Lan',
    'tr': 'Tiếng Thổ Nhĩ Kỳ',
    'bn': 'Tiếng Bangla',
    'ta': 'Tiếng Tamil',
    'te': 'Tiếng Telugu',
    'ml': 'Tiếng Malayalam',
    'mr': 'Tiếng Marathi',
    'pa': 'Tiếng Punjab',
    'uk': 'Tiếng Ukraina',
    'nl': 'Tiếng Hà Lan',
    'sv': 'Tiếng Thụy Điển',
    'cs': 'Tiếng Séc',
    'hu': 'Tiếng Hungary',
    'ro': 'Tiếng Romania',
    'el': 'Tiếng Hy Lạp',
    'he': 'Tiếng Hebrew',
    'fa': 'Tiếng Ba Tư',
    'ms': 'Tiếng Mã Lai',
    'fil': 'Tiếng Filipino'
};

/**
 * Structured Logger for YouTube Audio service
 */
function logAudio(level, message, meta = {}) {
    const logObj = {
        timestamp: new Date().toISOString(),
        level: level.toUpperCase(),
        service: 'YouTubeAudio',
        message,
        ...meta
    };
    if (level === 'error') {
        console.error(JSON.stringify(logObj));
    } else if (level === 'warn') {
        console.warn(JSON.stringify(logObj));
    } else {
        console.log(JSON.stringify(logObj));
    }
}

/**
 * Resolve yt-dlp binary path taking OS platform into account
 */
function getYtDlpPath() {
    const isLinux = process.platform === 'linux';
    const candidates = [];

    if (process.env.YTDLP_PATH) {
        candidates.push(process.env.YTDLP_PATH);
    }

    if (isLinux) {
        // Standard Linux paths
        candidates.push('/usr/local/bin/yt-dlp', '/usr/bin/yt-dlp', 'yt-dlp');
    } else {
        // macOS / Windows local development paths
        candidates.push(
            path.join(__dirname, 'bin', 'yt-dlp'),
            '/tmp/yt-dlp',
            '/usr/local/bin/yt-dlp',
            'yt-dlp'
        );
    }

    for (const candidate of candidates) {
        if (candidate === 'yt-dlp') {
            return 'yt-dlp';
        }
        if (fs.existsSync(candidate)) {
            try {
                fs.accessSync(candidate, fs.constants.X_OK);
                return candidate;
            } catch (e) {
                // not executable
            }
        }
    }
    return 'yt-dlp'; // fallback to PATH lookup
}

/**
 * Get readable language name from code or format note
 */
function getLanguageDisplayName(langCode, formatNote) {
    if (langCode && LANGUAGE_NAMES[langCode]) {
        return LANGUAGE_NAMES[langCode];
    }
    if (formatNote) {
        let clean = formatNote.replace(/,\s*(medium|low|tiny|ultralow)/gi, '').trim();
        clean = clean.replace(/-\s*dubbed/gi, '').trim();
        if (clean) return clean;
    }
    return langCode || 'Âm thanh';
}

/**
 * Fetch HTML of YouTube watch page with realistic headers and cookies
 */
function fetchWatchPage(videoId, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 3) {
            return reject(new Error('Too many redirects when fetching YouTube watch page'));
        }

        const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=vi`;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            // Pre-seed Google consent and language cookies to bypass consent interstitials
            'Cookie': 'PREF=hl=vi&gl=VN; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODI5LjA3X3AwGgJ2aSACGgYIgLCnpgY;'
        };

        const req = https.get(url, { headers, timeout: 10000 }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = res.headers.location.startsWith('http') 
                    ? res.headers.location 
                    : `https://www.youtube.com${res.headers.location}`;
                
                https.get(nextUrl, { headers, timeout: 10000 }, (redirectRes) => {
                    let data = '';
                    redirectRes.on('data', chunk => data += chunk);
                    redirectRes.on('end', () => resolve(data));
                }).on('error', reject);
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('timeout', () => {
            req.destroy(new Error('Watch page request timeout'));
        });
        req.on('error', reject);
    });
}

/**
 * Layer 2: Extract audio tracks from YouTube Watch Page HTML
 */
async function extractTracksFromWatchPage(videoId) {
    try {
        const html = await fetchWatchPage(videoId);
        if (!html) return null;

        const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});(?:var|\n|<\/script>)/s);
        if (!match) {
            logAudio('warn', 'Could not locate ytInitialPlayerResponse in watch page HTML', { videoId });
            return null;
        }

        const playerResponse = JSON.parse(match[1]);
        const adaptiveFormats = playerResponse.streamingData?.adaptiveFormats || [];
        const audioFormats = adaptiveFormats.filter(f => f.mimeType && f.mimeType.startsWith('audio/'));

        if (!audioFormats || audioFormats.length === 0) {
            logAudio('info', 'No adaptive audio formats found in player response', { videoId });
            return null;
        }

        const trackMap = new Map();
        
        // Default YouTube player audio
        trackMap.set('default', {
            id: 'default',
            formatId: 'default',
            displayName: 'Mặc định (YouTube Player)',
            languageCode: 'default',
            languageName: 'Mặc định',
            isDefault: true,
            isDubbed: false,
            audioQuality: 'auto'
        });

        for (const format of audioFormats) {
            const audioTrack = format.audioTrack;
            if (audioTrack && audioTrack.id) {
                const rawId = audioTrack.id;
                const langCode = rawId.split('.')[0] || 'und';
                const isOriginal = audioTrack.displayName && (audioTrack.displayName.includes('gốc') || audioTrack.displayName.includes('original'));
                const langName = getLanguageDisplayName(langCode, audioTrack.displayName);
                const displayName = isOriginal ? `${langName} (Gốc)` : `${langName} (Lồng tiếng)`;
                const trackId = langCode;

                if (!trackMap.has(trackId)) {
                    trackMap.set(trackId, {
                        id: trackId,
                        formatId: String(format.itag),
                        displayName: displayName,
                        languageCode: langCode,
                        languageName: langName,
                        isDefault: !!audioTrack.audioIsDefault,
                        isDubbed: !isOriginal,
                        audioQuality: format.audioQuality ? format.audioQuality.replace('AUDIO_QUALITY_', '').toLowerCase() : 'medium',
                        bitrate: format.bitrate || format.averageBitrate || 128,
                        mimeType: format.mimeType
                    });
                }
            }
        }

        logAudio('info', `Watch page parser extracted ${trackMap.size} tracks`, { videoId, count: trackMap.size });
        return Array.from(trackMap.values());
    } catch (err) {
        logAudio('warn', `Watch page parser error: ${err.message}`, { videoId, stack: err.stack });
        return null;
    }
}

/**
 * Layer 1: Extract audio tracks and formats using yt-dlp
 */
function extractTracksWithYtDlp(videoId) {
    return new Promise((resolve) => {
        const ytDlp = getYtDlpPath();
        if (!ytDlp) {
            logAudio('info', 'yt-dlp binary not found, skipping yt-dlp extraction', { videoId });
            return resolve(null);
        }

        const args = [
            '-J',
            '--flat-playlist',
            '--no-warnings',
            '--no-check-certificates',
            `https://www.youtube.com/watch?v=${videoId}`
        ];

        execFile(ytDlp, args, { maxBuffer: 25 * 1024 * 1024, timeout: 15000 }, (error, stdout, stderr) => {
            if (error || !stdout) {
                logAudio('warn', `yt-dlp execution failed: ${error ? error.message : 'No output'}`, { 
                    videoId, 
                    stderr: stderr ? stderr.substring(0, 200) : null 
                });
                return resolve(null);
            }

            try {
                const json = JSON.parse(stdout);
                const formats = json.formats || [];
                const audioFormats = formats.filter(f => f.vcodec === 'none' && f.acodec !== 'none');

                if (audioFormats.length === 0) {
                    return resolve(null);
                }

                const trackMap = new Map();
                trackMap.set('default', {
                    id: 'default',
                    formatId: 'default',
                    displayName: 'Mặc định (YouTube Player)',
                    languageCode: 'default',
                    languageName: 'Mặc định',
                    isDefault: true,
                    isDubbed: false,
                    audioQuality: 'auto'
                });

                // Find if there are multiple language tracks
                const hasMultiTracks = audioFormats.some(f => f.language || (f.format_note && (f.format_note.includes('dubbed') || f.format_note.includes('original'))));

                if (!hasMultiTracks) {
                    return resolve(Array.from(trackMap.values()));
                }

                audioFormats.forEach((f) => {
                    const langCode = f.language || (f.language_preference === 10 ? 'orig' : (f.format_note && f.format_note.includes('original') ? 'orig' : null));
                    if (!langCode && !f.format_note) return;

                    const effectiveLang = langCode || 'und';
                    const isOriginal = f.language_preference > 0 || (f.format_note && (f.format_note.toLowerCase().includes('original') || f.format_note.toLowerCase().includes('default')));
                    const isDubbed = !isOriginal;

                    const trackId = effectiveLang === 'und' ? f.format_id : effectiveLang;
                    const langName = getLanguageDisplayName(effectiveLang, f.format_note);
                    const displayName = isOriginal ? `${langName} (Gốc)` : `${langName} (Lồng tiếng)`;

                    // Score: prefer progressive audio (m4a/webm) over HLS (m3u8), and higher bitrate
                    const isProgressive = f.ext === 'm4a' || f.ext === 'webm' || (f.protocol && !f.protocol.includes('m3u8'));
                    const score = (f.tbr || f.abr || 128) + (isProgressive ? 1000 : 0);

                    const existing = trackMap.get(trackId);
                    const existingScore = existing ? (existing._score || 0) : -1;

                    if (!existing || score > existingScore) {
                        trackMap.set(trackId, {
                            id: trackId,
                            formatId: f.format_id,
                            displayName: displayName,
                            languageCode: effectiveLang,
                            languageName: langName,
                            isDefault: isOriginal,
                            isDubbed: isDubbed,
                            audioQuality: f.abr ? `${Math.round(f.abr)} kbps` : 'medium',
                            bitrate: f.tbr || f.abr || 128,
                            ext: f.ext,
                            url: f.url,
                            _score: score
                        });
                    }
                });

                const result = Array.from(trackMap.values()).map(t => {
                    const { _score, ...rest } = t;
                    return rest;
                });

                logAudio('info', `yt-dlp successfully parsed ${result.length} tracks`, { videoId, count: result.length });
                resolve(result);
            } catch (parseErr) {
                logAudio('warn', `Failed to parse yt-dlp JSON: ${parseErr.message}`, { videoId });
                resolve(null);
            }
        });
    });
}

/**
 * Get available audio tracks with automatic fallback and memory cache
 */
async function getAudioTracks(videoId) {
    if (!videoId || typeof videoId !== 'string') {
        throw new Error('Invalid video ID');
    }

    // Check memory cache
    const cached = trackCache.get(videoId);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        return cached.tracks;
    }

    let tracks = null;

    // Layer 1: yt-dlp
    try {
        tracks = await extractTracksWithYtDlp(videoId);
    } catch (e) {
        logAudio('warn', `yt-dlp layer error: ${e.message}`, { videoId });
    }

    // Layer 2: Watch Page Scraper if yt-dlp failed or only returned 1 track
    if (!tracks || tracks.length <= 1) {
        try {
            const watchPageTracks = await extractTracksFromWatchPage(videoId);
            if (watchPageTracks && watchPageTracks.length > 1) {
                tracks = watchPageTracks;
            }
        } catch (e) {
            logAudio('warn', `Watch page layer error: ${e.message}`, { videoId });
        }
    }

    // Layer 3: Safe Fallback to default YouTube track (guarantees no 500 error)
    if (!tracks || tracks.length === 0) {
        logAudio('info', `No multi-language tracks found, falling back to default track`, { videoId });
        tracks = [{
            id: 'default',
            formatId: 'default',
            displayName: 'Mặc định (YouTube Player)',
            languageCode: 'default',
            languageName: 'Mặc định',
            isDefault: true,
            isDubbed: false,
            audioQuality: 'auto'
        }];
    }

    // Cache the result
    trackCache.set(videoId, {
        tracks: tracks,
        timestamp: Date.now()
    });

    return tracks;
}

/**
 * Get direct stream URL for a specific track
 */
async function getAudioStreamUrl(videoId, trackId) {
    const cacheKey = `${videoId}_${trackId}`;
    const cached = streamUrlCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.url;
    }

    const tracks = await getAudioTracks(videoId);
    const track = tracks.find(t => t.id === trackId || t.languageCode === trackId || t.formatId === trackId);
    
    if (!track) {
        throw new Error(`Track ${trackId} not found for video ${videoId}`);
    }

    // If track already has direct URL from yt-dlp dump
    if (track.url) {
        streamUrlCache.set(cacheKey, {
            url: track.url,
            expiresAt: Date.now() + (5 * 60 * 1000)
        });
        return track.url;
    }

    // Extract direct URL via yt-dlp -g
    const ytDlp = getYtDlpPath();
    if (ytDlp) {
        return new Promise((resolve, reject) => {
            const formatArg = track.formatId && track.formatId !== 'default' ? track.formatId : 'ba/b';
            const args = [
                '-g',
                '-f', formatArg,
                '--no-warnings',
                `https://www.youtube.com/watch?v=${videoId}`
            ];

            execFile(ytDlp, args, { timeout: 12000 }, (error, stdout) => {
                if (error || !stdout || !stdout.trim()) {
                    return reject(new Error(`Failed to resolve stream URL with yt-dlp: ${error ? error.message : 'Empty output'}`));
                }

                const url = stdout.trim().split('\n')[0];
                streamUrlCache.set(cacheKey, {
                    url: url,
                    expiresAt: Date.now() + (5 * 60 * 1000)
                });
                resolve(url);
            });
        });
    }

    throw new Error('Unable to extract audio stream URL for track');
}

/**
 * Stream audio track to HTTP response supporting Range requests
 */
async function streamAudioTrack(req, res, videoId, trackId) {
    try {
        if (!trackId || trackId === 'default') {
            return res.status(400).json({ error: 'Default audio is played directly in YouTube player' });
        }

        const streamUrl = await getAudioStreamUrl(videoId, trackId);
        if (!streamUrl) {
            return res.status(404).json({ error: 'Audio stream URL not found' });
        }

        const clientReqHeaders = {};
        if (req.headers.range) {
            clientReqHeaders['Range'] = req.headers.range;
        }
        clientReqHeaders['User-Agent'] = req.headers['user-agent'] || 'Mozilla/5.0';

        const proxyReq = https.get(streamUrl, {
            headers: clientReqHeaders
        }, (proxyRes) => {
            // Forward status code (206 Partial Content or 200 OK)
            res.status(proxyRes.statusCode);

            const forwardHeaders = [
                'content-range',
                'content-length',
                'content-type',
                'accept-ranges',
                'cache-control'
            ];

            forwardHeaders.forEach(header => {
                if (proxyRes.headers[header]) {
                    res.setHeader(header, proxyRes.headers[header]);
                }
            });

            if (!res.getHeader('content-type')) {
                res.setHeader('Content-Type', 'audio/mp4');
            }
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Access-Control-Allow-Origin', '*');

            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            logAudio('error', `Proxy stream error: ${err.message}`, { videoId, trackId });
            if (!res.headersSent) {
                res.status(502).json({ error: 'Failed to stream audio from source' });
            }
        });

        req.on('close', () => {
            proxyReq.destroy();
        });

    } catch (err) {
        logAudio('error', `Stream handler exception: ${err.message}`, { videoId, trackId, stack: err.stack });
        if (!res.headersSent) {
            res.status(500).json({ error: err.message });
        }
    }
}

module.exports = {
    getAudioTracks,
    getAudioStreamUrl,
    streamAudioTrack,
    getYtDlpPath
};
