
  const $ = id => document.getElementById(id);
  const videos = [
    { id:'avc',  name:'H.264 / AVC' },
    { id:'hevc', name:'H.265 / HEVC' },
    { id:'av1',  name:'AV1' },
    { id:'vp9',  name:'VP9' },
    { id:'vp8',  name:'VP8' }
  ];
  const audios = [
    { id:'aac', name:'AAC' },
    { id:'opus', name:'Opus' },
    { id:'mp3', name:'MP3' },
    { id:'vorbis', name:'Vorbis' }
  ];
  const profiles = {
    720: { width:720, height:1280, bitrate:2_000_000 },
    1080: { width:1080, height:1920, bitrate:4_000_000 },
    2160: { width:2160, height:3840, bitrate:12_000_000 }
  };
  const formats = [
    { name:'H.264 + AAC · MP4', mime:'video/mp4; codecs="avc1.42E01F, mp4a.40.2"', v:'video/mp4; codecs="avc1.42E01F"', a:'audio/mp4; codecs="mp4a.40.2"' },
    { name:'HEVC + AAC · MP4', mime:'video/mp4; codecs="hvc1.1.6.L93.B0, mp4a.40.2"', v:'video/mp4; codecs="hvc1.1.6.L93.B0"', a:'audio/mp4; codecs="mp4a.40.2"' },
    { name:'AV1 + Opus · WebM', mime:'video/webm; codecs="av01.0.05M.08, opus"', v:'video/webm; codecs="av01.0.05M.08"', a:'audio/webm; codecs="opus"' },
    { name:'VP9 + Opus · WebM', mime:'video/webm; codecs="vp09.00.31.08, opus"', v:'video/webm; codecs="vp09.00.31.08"', a:'audio/webm; codecs="opus"' }
  ];
  const badge = value => value === true ? '<span class="pill yes">✓ Yes</span>' : value === false ? '<span class="pill no">✕ No</span>' : '<span class="pill unknown">Unknown</span>';
  const htmlBadge = value => value === 'probably' ? '<span class="pill yes">Likely</span>' : value === 'maybe' ? '<span class="pill maybe">Maybe</span>' : '<span class="pill no">No</span>';
  const withTimeout = promise => {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Query timed out after 10 seconds')), 10000);
    })]).finally(() => clearTimeout(timer));
  };
  let errors = [];
  const check = async (fn, label = 'Capability query') => {
    try { return await withTimeout(Promise.resolve().then(fn)); }
    catch (e) { errors.push({test:label, message:String(e.message || e)}); return null; }
  };
  let result = null;
  let busy = false;
  const environment = () => ({
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform || navigator.platform || 'Unknown',
    logicalCPUThreads: navigator.hardwareConcurrency ?? null,
    deviceMemoryGB: navigator.deviceMemory ?? null,
    touchPoints: navigator.maxTouchPoints ?? 0,
    videoEncoderAPI: typeof VideoEncoder !== 'undefined',
    videoDecoderAPI: typeof VideoDecoder !== 'undefined',
    audioEncoderAPI: typeof AudioEncoder !== 'undefined',
    audioDecoderAPI: typeof AudioDecoder !== 'undefined',
    mediaRecorderAPI: typeof MediaRecorder !== 'undefined',
    mediaCapabilitiesAPI: !!navigator.mediaCapabilities,
    mediaSourceAPI: typeof MediaSource !== 'undefined',
    managedMediaSourceAPI: typeof ManagedMediaSource !== 'undefined',
    secureContext: isSecureContext,
    screen: {width:screen.width, height:screen.height, pixelRatio:devicePixelRatio},
    crossOriginIsolated: self.crossOriginIsolated === true
  });
  $('environment').textContent = JSON.stringify(environment(), null, 2);

  function paintRows(id, rows, playback=false) {
    $(id).innerHTML = rows.map(x => playback
      ? `<tr><td>${x.name}</td><td>${htmlBadge(x.html)}</td><td>${badge(x.supported)}</td><td>${badge(x.smooth)}</td><td>${badge(x.efficient)}</td></tr>`
      : `<tr><td>${x.name}</td><td>${badge(x.encode)}</td><td>${badge(x.decode)}</td></tr>`
    ).join('');
  }

  function paintSummary(v,a) {
    const items = [
      ['Video encoders', v.filter(x=>x.encode===true).length, v.length],
      ['Video decoders', v.filter(x=>x.decode===true).length, v.length],
      ['Audio encoders', a.filter(x=>x.encode===true).length, a.length],
      ['Audio decoders', a.filter(x=>x.decode===true).length, a.length]
    ];
    $('summary').innerHTML = items.map(([label,n,total]) => `<div class="metric"><small>${label}</small><strong>${n}/${total}</strong></div>`).join('');
  }

  $('scan').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    result = null;
    $('scan').disabled = $('copy').disabled = $('download').disabled = $('screenshot').disabled = true;
    for (const id of ['profile','orientation','fps']) $(id).disabled = true;
    errors = [];
    for (const id of ['video','audio','playback','transport']) $(id).replaceChildren();
    document.querySelectorAll('.metric strong').forEach(el => el.textContent = '—');
    $('scan-meta').textContent = 'Scan in progress…';
    $('scan').textContent = 'Scanning…';
    const env = environment();
    $('environment').textContent = JSON.stringify(env,null,2);
    const profile = {...profiles[$('profile').value], frameRate:Number($('fps').value)};
    if ($('orientation').value === 'landscape') [profile.width,profile.height] = [profile.height,profile.width];
    const start = performance.now();
    try {
      $('status').textContent = 'Loading Mediabunny…';
      const { canEncodeVideo, canDecodeVideo, canEncodeAudio, canDecodeAudio, Quality } =
        await withTimeout(import('./vendor/mediabunny-1.65.2.mjs'));

      const video = [];
      for (const c of videos) {
        $('status').textContent = `Checking ${c.name} video…`;
        const [encode,decode] = await Promise.all([
          check(() => canEncodeVideo(c.id, {
            width:profile.width, height:profile.height, frameRate:profile.frameRate,
            quality:new Quality({bitrate:profile.bitrate})
          }), `${c.id} encode`),
          check(() => canDecodeVideo(c.id, {
            codedWidth:profile.width, codedHeight:profile.height
          }), `${c.id} decode`)
        ]);
        video.push({ ...c, encode, decode });
        paintRows('video',video);
      }

      const audio = [];
      for (const c of audios) {
        $('status').textContent = `Checking ${c.name} audio…`;
        const [encode,decode] = await Promise.all([
          check(() => canEncodeAudio(c.id, {
            numberOfChannels:2, sampleRate:48000,
            quality:new Quality({bitrate:128000})
          }), `${c.id} encode`),
          check(() => canDecodeAudio(c.id, { numberOfChannels:2, sampleRate:48000 }), `${c.id} decode`)
        ]);
        audio.push({ ...c, encode, decode });
        paintRows('audio',audio);
      }

      const playback = [];
      const el = document.createElement('video');
      for (const fmt of formats) {
        $('status').textContent = `Checking ${fmt.name} playback…`;
        const html = el.canPlayType(fmt.mime);
        const caps = navigator.mediaCapabilities?.decodingInfo
          ? await check(() => navigator.mediaCapabilities.decodingInfo({
              type:'file',
              video: { contentType:fmt.v, width:720, height:1280, bitrate:2_000_000, framerate:30 },
              audio: { contentType:fmt.a, channels:2, bitrate:128_000, samplerate:48000 }
            }), `playback: ${fmt.mime}`)
          : null;
        playback.push({ name:fmt.name, mime:fmt.mime, videoContentType:fmt.v, audioContentType:fmt.a, html,
          supported:caps?.supported ?? null,
          smooth:caps?.smooth ?? null,
          efficient:caps?.powerEfficient ?? null
        });
        paintRows('playback',playback,true);
      }
      const transport = [];
      for (const fmt of formats) {
        transport.push({name:fmt.name, mime:fmt.mime,
          record:typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
            ? await check(() => MediaRecorder.isTypeSupported(fmt.mime), `record: ${fmt.mime}`) : null,
          mediaSource:typeof MediaSource !== 'undefined' && typeof MediaSource.isTypeSupported === 'function'
            ? await check(() => MediaSource.isTypeSupported(fmt.mime), `mediaSource: ${fmt.mime}`) : null
        });
      }
      $('transport').innerHTML = transport.map(x => `<tr><td>${x.name}</td><td>${badge(x.record)}</td><td>${badge(x.mediaSource)}</td></tr>`).join('');
      result = { schemaVersion:1, appVersion:'0.1.0', generatedAt:new Date().toISOString(), mediabunny:'1.65.2',
        profile:{...profile}, playbackProfile:{width:720,height:1280,bitrate:2_000_000,frameRate:30}, environment:env, video, audio, playback, transport, errors,
        seconds:Math.round((performance.now()-start)/10)/100
      };
      paintSummary(video,audio);
      $('copy').disabled = $('download').disabled = $('screenshot').disabled = false;
      $('scan-meta').textContent = `${new Date(result.generatedAt).toLocaleString()} · ${profile.width} × ${profile.height} · ${profile.frameRate} fps · ${profile.bitrate / 1e6} Mbps`;
      $('status').textContent = `✓ Scan complete in ${result.seconds}s. ${errors.length ? `${errors.length} queries returned Unknown. ` : ''}Nothing uploaded.`;
      
    } catch(e) {
      console.error(e);
      $('scan-meta').textContent = 'Scan did not finish. Reload the page, then try again.';
      $('status').textContent = `Scan failed: ${e.message}. Reload the page and check that the vendor files are present.`;
    } finally {
      for (const id of ['profile','orientation','fps']) $(id).disabled = false;
      busy = false;
      $('scan').disabled = false;
      $('scan').textContent = 'Run capability scan';
    }
  });

  $('copy').addEventListener('click', async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(result,null,2));
      $('status').textContent = '✓ JSON copied.';
    } catch { $('status').textContent = 'Clipboard blocked. Use Download JSON.'; }
  });
  $('download').addEventListener('click', () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result,null,2)], {type:'application/json'});
    saveBlob(blob, `browser-media-report-${result.generatedAt.slice(0,10)}.json`);
  });

  // Render the entire document, including content below the viewport. No screen permission needed.
  $('screenshot').addEventListener('click', async () => {
    if (!result || busy) return;
    busy = true;
    $('screenshot').disabled = $('scan').disabled = true;
    try {
      if (typeof window.html2canvas !== 'function') throw new Error('Screenshot library is unavailable. Reload the page.');
      await document.fonts.ready;
      const width = Math.max(980, document.documentElement.clientWidth, document.documentElement.scrollWidth);
      const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      // Stay below common mobile canvas area / dimension limits.
      const scale = Math.min(2, window.devicePixelRatio || 1, 8192 / width, 8192 / height, Math.sqrt(16_000_000 / (width * height)));
      const canvas = await window.html2canvas(document.body, {
        backgroundColor:'#0a1020', scale, width,
        windowWidth:width, windowHeight:900, scrollX:0, scrollY:0, logging:false,
        onclone:doc => {
          doc.body.style.minHeight = '0';
          doc.getElementById('screenshot').disabled = false;
          doc.getElementById('scan').disabled = false;
          doc.querySelectorAll('.scroll').forEach(el => { el.style.overflow = 'visible'; });
        }
      });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('The browser could not create the image. Try a smaller window.');
      saveBlob(blob, `browser-media-report-${result.generatedAt.slice(0,10)}.png`);
      $('status').textContent = 'Full-page PNG saved. Review environment details before sharing.';
    } catch (error) { $('status').textContent = `Screenshot failed: ${error.message}`; }
    finally { busy = false; $('screenshot').disabled = $('scan').disabled = false; }
  });
  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  for (const id of ['profile','orientation','fps']) $(id).addEventListener('change', () => {
    if (result) $('status').textContent = 'Profile changed. Run a new scan to update results. Exports still contain the previous scan.';
  });
