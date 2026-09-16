const https = require('https');
const http = require('http');
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Cache audio tracks, raw formats, and direct URLs in memory with TTL (15 minutes)
const trackCache = new Map(); // videoId -> { tracks, isFallback, errorCode, message, action, hasCookies, timestamp }
const rawFormatsCache = new Map(); // videoId -> { formats, timestamp }
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
 * Categorize YouTube bot detection and error responses
 */
function categorizeYouTubeError(errMessage, stderr = '') {
    const combined = `${errMessage || ''} ${stderr || ''}`.toLowerCase();
    
    if (combined.includes('sign in to confirm you’re not a bot') || 
        combined.includes('sign in to confirm you\'re not a bot') ||
        combined.includes('bot detection') ||
        combined.includes('automated queries')) {
        return {
            code: 'YOUTUBE_BOT_DETECTION',
            message: 'YouTube phát hiện truy vấn tự động và yêu cầu xác thực bot trên IP máy chủ.',
            action: 'Cần cấu hình YOUTUBE_COOKIES_TEXT hoặc YOUTUBE_COOKIES_FILE trên server.'
        };
    }

    if (combined.includes('http error 429') || combined.includes('too many requests')) {
        return {
            code: 'YOUTUBE_RATE_LIMITED',
            message: 'YouTube giới hạn tần suất truy vấn (Rate Limited HTTP 429).',
            action: 'Chờ đợi hoặc sử dụng cookies xác thực từ server.'
        };
    }

    if (combined.includes('confirm your age') || combined.includes('age-restricted') || combined.includes('age restricted')) {
        return {
            code: 'YOUTUBE_AGE_RESTRICTED',
            message: 'Video giới hạn độ tuổi yêu cầu đăng nhập tài khoản.',
            action: 'Cần cung cấp cookies của tài khoản đã xác minh độ tuổi.'
        };
    }

    if (combined.includes('not available in your country') || combined.includes('geo-restricted')) {
        return {
            code: 'YOUTUBE_GEO_RESTRICTED',
            message: 'Video bị giới hạn vùng địa lý đối với IP của server.',
            action: 'Video không phát được từ quốc gia của máy chủ.'
        };
    }

    if (combined.includes('private video') || combined.includes('members-only')) {
        return {
            code: 'YOUTUBE_ACCESS_DENIED',
            message: 'Video riêng tư hoặc chỉ dành cho hội viên.',
            action: 'Video yêu cầu quyền truy cập đặc biệt.'
        };
    }

    return {
        code: 'YOUTUBE_EXTRACTION_FAILED',
        message: errMessage || 'Không thể trích xuất metadata từ YouTube.',
        action: 'Tự động sử dụng audio mặc định từ YouTube player.'
    };
}

/**
 * Sanitize and normalize Netscape HTTP cookie format (repair spaces-to-tabs, ensure standard headers)
 */
function sanitizeNetscapeCookies(raw) {
    if (!raw || typeof raw !== 'string') return { content: '', count: 0, hasAuth: false };
    const lines = raw.split(/\r?\n/);
    const cleanLines = [
        '# Netscape HTTP Cookie File',
        '# https://curl.se/docs/http-cookies.html',
        '# This file was generated by Stream App Cookie Sanitizer',
        ''
    ];
    let count = 0;
    let hasAuth = false;
    const authNames = new Set(['SID', 'HSID', 'SSID', 'LOGIN_INFO', '__Secure-3PSID', '__Secure-1PSID', 'SAPISID', 'APISID']);

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#')) continue;

        // Check if tab-separated or space-separated (caused by text editor copy-paste)
        let parts = line.split('\t');
        if (parts.length < 7) {
            parts = line.split(/\s+/);
        }

        if (parts.length >= 7) {
            const domain = parts[0];
            const flag = parts[1].toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
            const path = parts[2];
            const secure = parts[3].toUpperCase() === 'TRUE' ? 'TRUE' : 'FALSE';
            const expiry = parts[4];
            const name = parts[5];
            const value = parts.slice(6).join(' ');

            if (name && value) {
                if (authNames.has(name)) {
                    hasAuth = true;
                }
                cleanLines.push([domain, flag, path, secure, expiry, name, value].join('\t'));
                count++;
            }
        }
    }

    return {
        content: cleanLines.join('\n'),
        count,
        hasAuth
    };
}

let lastLoggedCookieState = null;

/**
 * Resolve cookies file path from environment or local filesystem with automatic Netscape format sanitization
 */
function getCookiesFilePath() {
    let rawCookieContent = null;
    let source = null;

    // 1. Direct environment variable path
    if (process.env.YOUTUBE_COOKIES_FILE && fs.existsSync(process.env.YOUTUBE_COOKIES_FILE)) {
        try {
            rawCookieContent = fs.readFileSync(process.env.YOUTUBE_COOKIES_FILE, 'utf8');
            source = `file:${process.env.YOUTUBE_COOKIES_FILE}`;
        } catch (e) {
            logAudio('warn', `Failed to read YOUTUBE_COOKIES_FILE: ${e.message}`);
        }
    }

    // 2. Cookie text/base64 passed via environment variable (ideal for Docker / Cloud platforms)
    if (!rawCookieContent) {
        const rawCookieData = process.env.YOUTUBE_COOKIES_TEXT || process.env.YOUTUBE_COOKIES_BASE64;
        if (rawCookieData && rawCookieData.trim()) {
            try {
                rawCookieContent = process.env.YOUTUBE_COOKIES_BASE64 
                    ? Buffer.from(rawCookieData.trim(), 'base64').toString('utf8')
                    : rawCookieData.trim();
                source = 'env_var';
            } catch (e) {
                logAudio('warn', `Failed to decode cookies from environment variable: ${e.message}`);
            }
        }
    }

    // 3. Local workspace cookies.txt file
    if (!rawCookieContent) {
        const localCookiePath = path.join(__dirname, 'cookies.txt');
        if (fs.existsSync(localCookiePath)) {
            try {
                rawCookieContent = fs.readFileSync(localCookiePath, 'utf8');
                source = 'local:cookies.txt';
            } catch (e) {
                logAudio('warn', `Failed to read local cookies.txt: ${e.message}`);
            }
        }
    }

    // 4. Standard Linux /etc path
    if (!rawCookieContent && fs.existsSync('/etc/youtube-cookies.txt')) {
        try {
            rawCookieContent = fs.readFileSync('/etc/youtube-cookies.txt', 'utf8');
            source = '/etc/youtube-cookies.txt';
        } catch (e) {
            logAudio('warn', `Failed to read /etc/youtube-cookies.txt: ${e.message}`);
        }
    }

    if (!rawCookieContent) {
        return null;
    }

    try {
        const { content, count, hasAuth } = sanitizeNetscapeCookies(rawCookieContent);
        if (count === 0) {
            logAudio('warn', `Cookies file found from ${source} but contains 0 valid cookie entries`, { source });
            return null;
        }

        const stateKey = `${source}_${count}_${hasAuth}`;
        if (lastLoggedCookieState !== stateKey) {
            lastLoggedCookieState = stateKey;
            logAudio('info', `Loaded & sanitized ${count} YouTube cookies from ${source}`, {
                source,
                cookieCount: count,
                hasAuthCookies: hasAuth,
                authNote: hasAuth 
                    ? 'Authenticated session cookies detected (SID/LOGIN_INFO present)' 
                    : 'WARNING: No auth session cookies found (SID/LOGIN_INFO missing). YouTube datacenter IP challenge requires cookies from a LOGGED-IN YouTube account.'
            });
        }

        const tempCookiePath = path.join('/tmp', 'yt_session_cookies.txt');
        fs.writeFileSync(tempCookiePath, content, 'utf8');
        return tempCookiePath;
    } catch (err) {
        logAudio('warn', `Failed to sanitize and write cookies: ${err.message}`);
        return null;
    }
}

/**
 * Parse cookies file to HTTP Cookie header string
 */
function getCookiesHeaderString() {
    const cookieFile = getCookiesFilePath();
    const defaultConsent = 'PREF=hl=vi&gl=VN; SOCS=CAISNQgDEitib3FfaWRlbnRpdHlmcm9udGVuZHVpc2VydmVyXzIwMjMwODI5LjA3X3AwGgJ2aSACGgYIgLCnpgY;';

    if (!cookieFile || !fs.existsSync(cookieFile)) {
        return defaultConsent;
    }

    try {
        const lines = fs.readFileSync(cookieFile, 'utf8').split('\n');
        const cookiePairs = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const parts = trimmed.split('\t');
            if (parts.length >= 7) {
                const name = parts[5];
                const value = parts[6];
                if (name && value) {
                    cookiePairs.push(`${name}=${value}`);
                }
            }
        }

        if (cookiePairs.length > 0) {
            return cookiePairs.join('; ');
        }
    } catch (err) {
        logAudio('warn', `Failed to parse cookies file for HTTP header: ${err.message}`);
    }

    return defaultConsent;
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
        // Standard Linux paths in Docker & VPS
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
    return 'yt-dlp';
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
 * Fetch HTML of YouTube watch page with cookies and anti-bot headers
 */
function fetchWatchPage(videoId, redirectCount = 0) {
    return new Promise((resolve, reject) => {
        if (redirectCount > 3) {
            return reject(new Error('Too many redirects when fetching YouTube watch page'));
        }

        const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=vi`;
        const cookieHeader = getCookiesHeaderString();

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'Cookie': cookieHeader
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

        // Check for bot detection in HTML
        if (html.includes('Sign in to confirm you’re not a bot') || html.includes('Sign in to confirm you\'re not a bot')) {
            logAudio('warn', 'YouTube Bot Challenge detected in Watch Page HTML', { 
                videoId, 
                errorCode: 'YOUTUBE_BOT_DETECTION' 
            });
            return null;
        }

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
        logAudio('warn', `Watch page parser error: ${err.message}`, { videoId });
        return null;
    }
}

/**
 * Layer 1: Extract audio tracks and formats using yt-dlp (with cookies and anti-bot flags)
 */
function extractTracksWithYtDlp(videoId) {
    return new Promise((resolve) => {
        const ytDlp = getYtDlpPath();
        if (!ytDlp) {
            logAudio('info', 'yt-dlp binary not found, skipping yt-dlp extraction', { videoId });
            return resolve({ tracks: null, error: { code: 'YTDLP_NOT_FOUND', message: 'yt-dlp binary not installed' } });
        }

        const cookiePath = getCookiesFilePath();
        const hasCookies = !!cookiePath;

        const args = [
            '-J',
            '--no-warnings',
            '--no-check-certificates',
            '--socket-timeout', '12',
            '--extractor-args', 'youtube:player_client=mweb,android,tv,web;player_skip=configs',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        ];

        // Attach cookies if available
        if (hasCookies) {
            args.push('--cookies', cookiePath);
        }

        args.push(`https://www.youtube.com/watch?v=${videoId}`);

        const child = spawn(ytDlp, args);
        let stdout = '';
        let stderr = '';
        let timer = setTimeout(() => {
            try { child.kill('SIGKILL'); } catch (e) {}
        }, 25000);

        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });

        child.on('error', (err) => {
            clearTimeout(timer);
            const errorInfo = categorizeYouTubeError(err.message, stderr);
            logAudio('warn', `yt-dlp spawn error: ${errorInfo.code} - ${errorInfo.message}`, { videoId, errorCode: errorInfo.code, hasCookies });
            resolve({ tracks: null, error: errorInfo });
        });

        child.on('close', (code) => {
            clearTimeout(timer);
            if (code !== 0 || !stdout) {
                const errorInfo = categorizeYouTubeError(code === null ? 'Timeout' : `yt-dlp exit ${code}`, stderr);
                logAudio('warn', `yt-dlp extraction failed: ${errorInfo.code} - ${errorInfo.message}`, { 
                    videoId, 
                    errorCode: errorInfo.code,
                    hasCookies,
                    stderr: stderr ? stderr.substring(0, 300) : null 
                });
                return resolve({ tracks: null, error: errorInfo });
            }

            try {
                const json = JSON.parse(stdout);
                const formats = json.formats || [];
                
                // Cache raw formats list for instant stream URL resolution
                rawFormatsCache.set(videoId, {
                    formats: formats,
                    timestamp: Date.now()
                });

                const audioFormats = formats.filter(f => 
                    (f.vcodec === 'none' && f.acodec !== 'none') || 
                    (f.mimeType && f.mimeType.startsWith('audio/')) ||
                    f.audioTrack
                );

                if (audioFormats.length === 0) {
                    return resolve({ tracks: null, error: { code: 'NO_AUDIO_FORMATS', message: 'No audio formats found in yt-dlp metadata' } });
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
                    return resolve({ tracks: Array.from(trackMap.values()), error: null });
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
                            acodec: f.acodec,
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

                logAudio('info', `yt-dlp successfully parsed ${result.length} tracks`, { 
                    videoId, 
                    count: result.length, 
                    hasCookies 
                });
                resolve({ tracks: result, error: null });
            } catch (parseErr) {
                logAudio('warn', `Failed to parse yt-dlp JSON: ${parseErr.message}`, { videoId });
                resolve({ tracks: null, error: { code: 'PARSE_JSON_ERROR', message: parseErr.message } });
            }
        });
    });
}

/**
 * Match best audio format from real format metadata without hardcoded assumptions
 */
function findBestAudioFormat(formats, targetTrackId) {
    if (!formats || !Array.isArray(formats) || formats.length === 0) return null;

    const audioFormats = formats.filter(f => 
        (f.vcodec === 'none' && f.acodec !== 'none') ||
        (f.mimeType && f.mimeType.startsWith('audio/')) ||
        f.audioTrack ||
        f.ext === 'm4a' || f.ext === 'webm' || f.ext === 'mp3'
    );

    if (audioFormats.length === 0) return null;

    const target = (targetTrackId || '').toLowerCase().trim();

    // 1. Match by exact format_id
    let matches = audioFormats.filter(f => f.format_id && String(f.format_id).toLowerCase() === target);

    // 2. Match by exact language code (e.g. 'vi', 'en', 'es-419')
    if (matches.length === 0 && target && target !== 'default') {
        matches = audioFormats.filter(f => {
            const lang = (f.language || (f.audioTrack && f.audioTrack.id ? f.audioTrack.id.split('.')[0] : '')).toLowerCase();
            return lang === target || lang.startsWith(target + '-') || target.startsWith(lang + '-');
        });
    }

    // 3. Match by format_note or displayName keywords
    if (matches.length === 0 && target && target !== 'default') {
        matches = audioFormats.filter(f => {
            const note = (f.format_note || '').toLowerCase();
            const name = (f.displayName || (f.audioTrack && f.audioTrack.displayName) || '').toLowerCase();
            return note.includes(target) || name.includes(target);
        });
    }

    // 4. Fallback to all audio formats if no exact match
    const candidates = matches.length > 0 ? matches : audioFormats;

    // Sort by quality: prefer progressive m4a/webm over m3u8, then higher bitrate
    candidates.sort((a, b) => {
        const aProgressive = (a.ext === 'm4a' || a.ext === 'webm' || (a.protocol && !a.protocol.includes('m3u8'))) ? 1 : 0;
        const bProgressive = (b.ext === 'm4a' || b.ext === 'webm' || (b.protocol && !b.protocol.includes('m3u8'))) ? 1 : 0;
        if (aProgressive !== bProgressive) return bProgressive - aProgressive;

        const aBitrate = a.tbr || a.abr || a.bitrate || 0;
        const bBitrate = b.tbr || b.abr || b.bitrate || 0;
        return bBitrate - aBitrate;
    });

    return candidates[0];
}

/**
 * Get available audio tracks details including diagnosis metadata and safe fallbacks
 */
async function getAudioTracksDetails(videoId) {
    if (!videoId || typeof videoId !== 'string') {
        throw new Error('Invalid video ID');
    }

    const cookiePath = getCookiesFilePath();
    const hasCookies = !!cookiePath;

    // Check memory cache
    const cached = trackCache.get(videoId);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
        return {
            tracks: cached.tracks,
            isFallback: cached.isFallback,
            errorCode: cached.errorCode,
            message: cached.message,
            action: cached.action,
            hasCookies
        };
    }

    let tracks = null;
    let lastError = null;

    // Layer 1: yt-dlp
    try {
        const ytdlpResult = await extractTracksWithYtDlp(videoId);
        if (ytdlpResult && ytdlpResult.tracks) {
            tracks = ytdlpResult.tracks;
        } else if (ytdlpResult && ytdlpResult.error) {
            lastError = ytdlpResult.error;
        }
    } catch (e) {
        logAudio('warn', `yt-dlp layer exception: ${e.message}`, { videoId });
        lastError = categorizeYouTubeError(e.message);
    }

    // Layer 2: Watch Page Scraper if yt-dlp failed or only returned 1 track
    if (!tracks || tracks.length <= 1) {
        try {
            const watchPageTracks = await extractTracksFromWatchPage(videoId);
            if (watchPageTracks && watchPageTracks.length > 1) {
                tracks = watchPageTracks;
                lastError = null; // Successfully extracted via Watch Page
            }
        } catch (e) {
            logAudio('warn', `Watch page layer exception: ${e.message}`, { videoId });
            if (!lastError) lastError = categorizeYouTubeError(e.message);
        }
    }

    // Layer 3: Safe Fallback to default YouTube track (guarantees no 500 error on server)
    const isFallback = !tracks || tracks.length <= 1;
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

    const details = {
        tracks: tracks,
        isFallback: isFallback,
        errorCode: isFallback && lastError ? lastError.code : undefined,
        message: isFallback && lastError ? lastError.message : undefined,
        action: isFallback && lastError ? lastError.action : undefined,
        hasCookies: hasCookies,
        timestamp: Date.now()
    };

    if (isFallback) {
        logAudio('info', `Using fallback default audio track for video`, { 
            videoId, 
            hasCookies,
            errorCode: details.errorCode,
            suggestion: hasCookies ? undefined : 'Set YOUTUBE_COOKIES_TEXT or YOUTUBE_COOKIES_FILE in server environment to bypass bot detection.'
        });
    }

    // Cache the result
    trackCache.set(videoId, details);

    return details;
}

/**
 * Get available audio tracks (array only)
 */
async function getAudioTracks(videoId) {
    const details = await getAudioTracksDetails(videoId);
    return details.tracks;
}

/**
 * Get direct stream URL for a specific track with dynamic format matching and safe fallback
 */
async function getAudioStreamUrl(videoId, trackId) {
    if (!trackId || trackId === 'default') {
        throw new Error('Default audio track is handled directly by YouTube Player');
    }

    const cacheKey = `${videoId}_${trackId}`;
    const cached = streamUrlCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.url;
    }

    // Step 1: Ensure formats are loaded in memory
    let rawFormats = null;
    const cachedFormats = rawFormatsCache.get(videoId);
    if (cachedFormats && (Date.now() - cachedFormats.timestamp < CACHE_TTL_MS)) {
        rawFormats = cachedFormats.formats;
    }

    // If formats not in memory or missing, trigger full extraction
    if (!rawFormats || rawFormats.length === 0) {
        await getAudioTracksDetails(videoId);
        const refetched = rawFormatsCache.get(videoId);
        if (refetched) {
            rawFormats = refetched.formats;
        }
    }

    // Step 2: If we have raw formats, find best matching format and its direct URL
    if (rawFormats && rawFormats.length > 0) {
        const bestFormat = findBestAudioFormat(rawFormats, trackId);
        if (bestFormat && bestFormat.url) {
            streamUrlCache.set(cacheKey, {
                url: bestFormat.url,
                expiresAt: Date.now() + (10 * 60 * 1000)
            });
            logAudio('info', `Resolved stream URL directly from format metadata`, {
                videoId,
                trackId,
                formatId: bestFormat.format_id,
                language: bestFormat.language,
                ext: bestFormat.ext,
                bitrate: bestFormat.tbr || bestFormat.abr
            });
            return bestFormat.url;
        }
    }

    // Step 3: If direct URL is not present in metadata, query yt-dlp dynamically without hardcoded format IDs
    const ytDlp = getYtDlpPath();
    if (ytDlp) {
        return new Promise((resolve, reject) => {
            const cookiePath = getCookiesFilePath();

            // Construct dynamic format selector:
            // e.g. "140-18/ba[language=vi]/ba/b"
            const formatSelectors = [];
            if (rawFormats && rawFormats.length > 0) {
                const best = findBestAudioFormat(rawFormats, trackId);
                if (best && best.format_id) {
                    formatSelectors.push(best.format_id);
                }
            }
            if (trackId && trackId !== 'default') {
                formatSelectors.push(`ba[language=${trackId}]`);
                formatSelectors.push(`ba[format_id*=${trackId}]`);
            }
            formatSelectors.push('ba/b');

            const formatArg = formatSelectors.join('/');

            const args = [
                '-g',
                '-f', formatArg,
                '--no-warnings',
                '--no-check-certificates',
                '--socket-timeout', '12',
                '--extractor-args', 'youtube:player_client=mweb,android,tv,web;player_skip=configs',
                '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            ];

            if (cookiePath) {
                args.push('--cookies', cookiePath);
            }

            args.push(`https://www.youtube.com/watch?v=${videoId}`);

            logAudio('info', `Resolving stream URL via yt-dlp with dynamic format selector: ${formatArg}`, {
                videoId,
                trackId,
                formatArg
            });

            const child = spawn(ytDlp, args);
            let stdout = '';
            let stderr = '';
            let timer = setTimeout(() => {
                try { child.kill('SIGKILL'); } catch (e) {}
            }, 20000);

            child.stdout.on('data', chunk => { stdout += chunk; });
            child.stderr.on('data', chunk => { stderr += chunk; });

            child.on('error', (err) => {
                clearTimeout(timer);
                const errInfo = categorizeYouTubeError(err.message, stderr);
                logAudio('warn', `Failed to resolve stream URL with yt-dlp: ${errInfo.code}`, {
                    videoId,
                    trackId,
                    formatArg,
                    errorCode: errInfo.code,
                    stderr: stderr ? stderr.substring(0, 200) : null
                });
                reject(new Error(errInfo.message));
            });

            child.on('close', (code) => {
                clearTimeout(timer);
                if (code !== 0 || !stdout || !stdout.trim()) {
                    const errInfo = categorizeYouTubeError(code === null ? 'Timeout' : `yt-dlp exit ${code}`, stderr);
                    logAudio('warn', `Failed to resolve stream URL with yt-dlp: ${errInfo.code}`, {
                        videoId,
                        trackId,
                        formatArg,
                        errorCode: errInfo.code,
                        stderr: stderr ? stderr.substring(0, 200) : null
                    });
                    return reject(new Error(errInfo.message));
                }

                const url = stdout.trim().split('\n')[0];
                streamUrlCache.set(cacheKey, {
                    url: url,
                    expiresAt: Date.now() + (10 * 60 * 1000)
                });
                resolve(url);
            });
        });
    }

    throw new Error('Unable to resolve audio stream URL');
}

/**
 * Stream audio track to HTTP response supporting Range requests and bot challenge handling
 */
async function streamAudioTrack(req, res, videoId, trackId) {
    try {
        if (!trackId || trackId === 'default') {
            return res.status(400).json({ error: 'Default audio is played directly in YouTube player' });
        }

        const streamUrl = await getAudioStreamUrl(videoId, trackId);
        if (!streamUrl) {
            return res.status(404).json({ 
                success: false, 
                errorCode: 'YOUTUBE_STREAM_NOT_FOUND',
                error: 'Audio stream URL not found' 
            });
        }

        const clientReqHeaders = {};
        if (req.headers.range) {
            clientReqHeaders['Range'] = req.headers.range;
        }
        clientReqHeaders['User-Agent'] = req.headers['user-agent'] || 'Mozilla/5.0';

        const proxyReq = https.get(streamUrl, {
            headers: clientReqHeaders,
            timeout: 15000
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
                res.status(502).json({ 
                    success: false,
                    errorCode: 'YOUTUBE_PROXY_ERROR',
                    error: 'Failed to stream audio from source' 
                });
            }
        });

        req.on('close', () => {
            proxyReq.destroy();
        });

    } catch (err) {
        const errorInfo = categorizeYouTubeError(err.message);
        logAudio('warn', `Stream handler exception: ${errorInfo.code} - ${errorInfo.message}`, { 
            videoId, 
            trackId, 
            errorCode: errorInfo.code 
        });
        if (!res.headersSent) {
            res.status(403).json({ 
                success: false,
                errorCode: errorInfo.code,
                error: errorInfo.message,
                action: errorInfo.action
            });
        }
    }
}

module.exports = {
    getAudioTracks,
    getAudioTracksDetails,
    getAudioStreamUrl,
    streamAudioTrack,
    getYtDlpPath,
    getCookiesFilePath,
    categorizeYouTubeError
};

