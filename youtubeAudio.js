const https = require('https');
const http = require('http');
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

// Cache audio tracks and direct URLs in memory with TTL (15 minutes)
const trackCache = new Map(); // videoId -> { tracks, timestamp }
const streamUrlCache = new Map(); // `${videoId}_${trackId}` -> { url, expiresAt }
const CACHE_TTL_MS = 15 * 60 * 1000;

// Mapping of language codes to Vietnamese & readable names
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

// Resolve yt-dlp binary path
function getYtDlpPath() {
    const candidates = [
        process.env.YTDLP_PATH,
        path.join(__dirname, 'bin', 'yt-dlp'),
        '/tmp/yt-dlp',
        'yt-dlp'
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (candidate === 'yt-dlp') {
            return 'yt-dlp';
        }
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

/**
 * Get readable language name from code or format note
 */
function getLanguageDisplayName(langCode, formatNote) {
    if (langCode && LANGUAGE_NAMES[langCode]) {
        return LANGUAGE_NAMES[langCode];
    }
    if (formatNote) {
        // Strip out ", medium", "- dubbed", etc.
        let clean = formatNote.replace(/,\s*(medium|low|tiny|ultralow)/gi, '').trim();
        clean = clean.replace(/-\s*dubbed/gi, '').trim();
        if (clean) return clean;
    }
    return langCode || 'Âm thanh';
}

/**
 * Fetch HTML of YouTube watch page
 */
function fetchWatchPage(videoId) {
    return new Promise((resolve, reject) => {
        const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=vi`;
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'vi,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                https.get(res.headers.location, (redirectRes) => {
                    let data = '';
                    redirectRes.on('data', chunk => data += chunk);
                    redirectRes.on('end', () => resolve(data));
                }).on('error', reject);
                return;
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

/**
 * Extract audio tracks using ytInitialPlayerResponse from watch page
 */
async function extractTracksFromWatchPage(videoId) {
    try {
        const html = await fetchWatchPage(videoId);
        const match = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});(?:var|\n|<\/script>)/s);
        if (!match) return null;

        const playerResponse = JSON.parse(match[1]);
        const adaptiveFormats = playerResponse.streamingData?.adaptiveFormats || [];
        const audioFormats = adaptiveFormats.filter(f => f.mimeType && f.mimeType.startsWith('audio/'));

        if (!audioFormats || audioFormats.length === 0) return null;

        const trackMap = new Map();
        
        // Always include default track
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

        return Array.from(trackMap.values());
    } catch (err) {
        console.warn(`[YouTubeAudio] Watch page fallback failed for ${videoId}:`, err.message);
        return null;
    }
}

/**
 * Extract audio tracks and formats using yt-dlp
 */
function extractTracksWithYtDlp(videoId) {
    return new Promise((resolve) => {
        const ytDlp = getYtDlpPath();
        if (!ytDlp) {
            return resolve(null);
        }

        const args = [
            '-J',
            '--flat-playlist',
            '--no-warnings',
            '--no-check-certificates',
            `https://www.youtube.com/watch?v=${videoId}`
        ];

        execFile(ytDlp, args, { maxBuffer: 25 * 1024 * 1024, timeout: 15000 }, (error, stdout) => {
            if (error || !stdout) {
                console.warn(`[YouTubeAudio] yt-dlp info failed: ${error ? error.message : 'No output'}`);
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
                    // Single track video
                    return resolve(Array.from(trackMap.values()));
                }

                // Process all audio formats
                audioFormats.forEach((f) => {
                    const langCode = f.language || (f.language_preference === 10 ? 'orig' : (f.format_note && f.format_note.includes('original') ? 'orig' : null));
                    if (!langCode && !f.format_note) return;

                    const effectiveLang = langCode || 'und';
                    const isOriginal = f.language_preference > 0 || (f.format_note && (f.format_note.toLowerCase().includes('original') || f.format_note.toLowerCase().includes('default')));
                    const isDubbed = !isOriginal;

                    const trackId = effectiveLang === 'und' ? f.format_id : effectiveLang;
                    const langName = getLanguageDisplayName(effectiveLang, f.format_note);
                    const displayName = isOriginal ? `${langName} (Gốc)` : `${langName} (Lồng tiếng)`;

                    // Format priority: prefer progressive formats (m4a / webm) over HLS (m3u8), and higher bitrate
                    const isProgressive = f.ext === 'm4a' || f.ext === 'webm' || (f.protocol && !f.protocol.includes('m3u8'));
                    const currentBitrate = (f.tbr || f.abr || 128) + (isProgressive ? 1000 : 0);

                    const existing = trackMap.get(trackId);
                    const existingBitrate = existing ? (existing._score || 0) : -1;

                    if (!existing || currentBitrate > existingBitrate) {
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
                            _score: currentBitrate
                        });
                    }
                });

                // Remove internal _score property before returning
                const result = Array.from(trackMap.values()).map(t => {
                    const { _score, ...rest } = t;
                    return rest;
                });

                resolve(result);
            } catch (parseErr) {
                console.warn('[YouTubeAudio] Failed to parse yt-dlp JSON:', parseErr.message);
                resolve(null);
            }
        });
    });
}

/**
 * Get available audio tracks for a given YouTube Video ID
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

    // Try yt-dlp first
    let tracks = await extractTracksWithYtDlp(videoId);

    // If yt-dlp failed or returned only default, try watch page parser
    if (!tracks || tracks.length <= 1) {
        const watchPageTracks = await extractTracksFromWatchPage(videoId);
        if (watchPageTracks && watchPageTracks.length > 1) {
            tracks = watchPageTracks;
        }
    }

    // Fallback: If no tracks detected, always return at least the default track
    if (!tracks || tracks.length === 0) {
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

            // Forward relevant audio streaming headers
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

            // Default content type if not set
            if (!res.getHeader('content-type')) {
                res.setHeader('Content-Type', 'audio/mp4');
            }
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Access-Control-Allow-Origin', '*');

            proxyRes.pipe(res);
        });

        proxyReq.on('error', (err) => {
            console.error('[YouTubeAudio] Proxy stream error:', err.message);
            if (!res.headersSent) {
                res.status(502).json({ error: 'Failed to stream audio from source' });
            }
        });

        // Abort upstream stream if client disconnects
        req.on('close', () => {
            proxyReq.destroy();
        });

    } catch (err) {
        console.error('[YouTubeAudio] Stream handler error:', err.message);
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
