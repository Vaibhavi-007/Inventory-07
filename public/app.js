/**
 * Change Blindness Visual Experiment Application
 * High-precision psychophysics visual search platform
 */

(function () {
  'use strict';

  // --- Audio Synthesis for zero-dependency sound effects ---
  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSound(type) {
    if (!state.config.sound) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'hit') {
        // Cheerful ascending arpeggio
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.12); // A5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'miss') {
        // Low descending buzz
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.exponentialRampToValueAtTime(146.83, now + 0.18);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'advance') {
        // Subtle click
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      }
    } catch (e) {
      console.warn('Audio feedback failed:', e);
    }
  }

  // --- App State ---
  const state = {
    screen: 'landing', // 'landing', 'experiment', 'results'
    datasetInfo: null,
    config: {
      n: 10,
      t: 80,
      imgDuration: 240,
      mode: 'continuous_flicker', // 'continuous_flicker' (default) or 'single_transition'
      tolerance: 15,
      shuffle: true,
      feedback: true,
      sound: true,
      timeoutSec: 60
    },
    trials: [],
    currentTrialIndex: 0,
    trialResults: [],
    sessionStartTime: 0,
    sessionId: null,

    // Runtime experiment variables
    trialState: 'idle', // 'present', 'interval', 'absent', 'feedback'
    stimulusStartTime: 0,
    currentTrialData: null,
    currentClick: null,
    flickerTimer: null,
    phaseTimer: null,
    trialTimeoutTimer: null,
    countdownInterval: null,
    fixationTimer: null,
    remainingSeconds: 60,
    maskCanvas: null,
    maskCtx: null
  };

  // --- DOM Elements ---
  const dom = {
    // Screens
    screenLanding: document.getElementById('screen-landing'),
    screenExperiment: document.getElementById('screen-experiment'),
    screenResults: document.getElementById('screen-results'),

    // Landing inputs
    sliderN: document.getElementById('slider-n'),
    inputN: document.getElementById('input-n'),
    valN: document.getElementById('val-n'),
    presetsN: document.getElementById('presets-n'),

    sliderT: document.getElementById('slider-t'),
    inputT: document.getElementById('input-t'),
    valT: document.getElementById('val-t'),
    presetsT: document.getElementById('presets-t'),

    sliderImgDur: document.getElementById('slider-img-dur'),
    inputImgDur: document.getElementById('input-img-dur'),
    valImgDur: document.getElementById('val-img-dur'),
    presetsImgDur: document.getElementById('presets-img-dur'),

    sliderTimeout: document.getElementById('slider-timeout'),
    inputTimeout: document.getElementById('input-timeout'),
    valTimeout: document.getElementById('val-timeout'),

    sliderTolerance: document.getElementById('slider-tolerance'),
    valTolerance: document.getElementById('val-tolerance'),

    chkShuffle: document.getElementById('chk-shuffle'),
    chkFeedback: document.getElementById('chk-feedback'),
    chkSound: document.getElementById('chk-sound'),

    btnStart: document.getElementById('btn-start'),
    datasetStatusText: document.getElementById('dataset-status-text'),

    // Experiment HUD & Stage
    hudCurrentTrial: document.getElementById('hud-current-trial'),
    hudTotalTrials: document.getElementById('hud-total-trials'),
    hudProgressFill: document.getElementById('hud-progress-fill'),
    hudStateBadge: document.getElementById('hud-state-badge'),
    hudStateText: document.getElementById('hud-state-text'),
    hudTimerVal: document.getElementById('hud-timer-val'),
    hudAccVal: document.getElementById('hud-acc-val'),
    hudRtVal: document.getElementById('hud-rt-val'),
    btnQuit: document.getElementById('btn-quit'),

    stageContainer: document.getElementById('stage-container'),
    stageWrapper: document.getElementById('stage-wrapper'),
    displayCanvas: document.getElementById('display-canvas'),
    blackOverlay: document.getElementById('black-screen-overlay'),
    feedbackOverlay: document.getElementById('feedback-overlay'),
    clickMarker: document.getElementById('click-marker'),

    feedbackMsg: document.getElementById('feedback-msg'),
    spacebarPrompt: document.getElementById('spacebar-prompt'),
    fixationOverlay: document.getElementById('fixation-overlay'),

    // Results screen
    resAccuracy: document.getElementById('res-accuracy'),
    resCorrectCount: document.getElementById('res-correct-count'),
    resMeanRt: document.getElementById('res-mean-rt'),
    resMeanRtSec: document.getElementById('res-mean-rt-sec'),
    resMedianRt: document.getElementById('res-median-rt'),
    resFastestRt: document.getElementById('res-fastest-rt'),
    resFastestItem: document.getElementById('res-fastest-item'),

    resLeftAcc: document.getElementById('res-left-acc'),
    resLeftRt: document.getElementById('res-left-rt'),
    resLeftCount: document.getElementById('res-left-count'),
    resRightAcc: document.getElementById('res-right-acc'),
    resRightRt: document.getElementById('res-right-rt'),
    resRightCount: document.getElementById('res-right-count'),

    resTotalBadge: document.getElementById('res-total-badge'),
    trialsTbody: document.getElementById('trials-tbody'),
    btnDownloadCsv: document.getElementById('btn-download-csv'),
    btnDownloadXlsx: document.getElementById('btn-download-xlsx'),
    btnDownloadJson: document.getElementById('btn-download-json'),
    btnNewExperiment: document.getElementById('btn-new-experiment'),

    // Inspection Modal
    inspectModal: document.getElementById('inspect-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalImgPresent: document.getElementById('modal-img-present'),
    modalImgAbsent: document.getElementById('modal-img-absent'),
    modalImgMask: document.getElementById('modal-img-mask'),
    modalClickPin: document.getElementById('modal-click-pin'),
    modalStats: document.getElementById('modal-stats'),
    btnCloseModal: document.getElementById('btn-close-modal')
  };

  const displayCtx = dom.displayCanvas.getContext('2d');
  const feedbackCtx = dom.feedbackOverlay.getContext('2d');

  // Offscreen canvas for mask pixel hit testing
  state.maskCanvas = document.createElement('canvas');
  state.maskCanvas.width = 1024;
  state.maskCanvas.height = 768;
  state.maskCtx = state.maskCanvas.getContext('2d', { willReadFrequently: true });

  // Preloaded image caches for latency-free stimulus onset
  const imageCache = new Map();

  function preloadImage(url) {
    if (imageCache.has(url)) return Promise.resolve(imageCache.get(url));
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        imageCache.set(url, img);
        resolve(img);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  // --- Navigation ---
  function showScreen(name) {
    state.screen = name;
    [dom.screenLanding, dom.screenExperiment, dom.screenResults].forEach(s => s.classList.remove('active'));

    if (name === 'landing') {
      dom.screenLanding.classList.add('active');
    } else if (name === 'experiment') {
      dom.screenExperiment.classList.add('active');
    } else if (name === 'results') {
      dom.screenResults.classList.add('active');
    }
  }

  // --- Initialization & UI Binding ---
  async function init() {
    bindLandingControls();
    bindExperimentControls();
    bindResultsControls();

    // Fetch dataset info from server
    try {
      const res = await fetch('/api/dataset-info');
      const data = await res.json();
      state.datasetInfo = data;
      if (data.total_pairs) {
        dom.sliderN.max = data.total_pairs;
        dom.inputN.max = data.total_pairs;
        dom.datasetStatusText.textContent = `${data.total_pairs} Stimuli Pairs Ready (${data.categories.filler} fillers, ${data.categories.practice} practice, ${data.categories.window} window, ${data.categories.mirror} mirror)`;
      }
      if (data.defaults) {
        if (data.defaults.n) setN(data.defaults.n);
        if (data.defaults.t_interval_ms) setT(data.defaults.t_interval_ms);
        if (data.defaults.image_duration_ms) setImgDur(data.defaults.image_duration_ms);
        if (data.defaults.timeout_sec) setTimeoutSec(data.defaults.timeout_sec);
        if (data.defaults.mode) {
          state.config.mode = data.defaults.mode;
          document.querySelectorAll('input[name="param-mode"]').forEach(radio => {
            radio.checked = (radio.value === data.defaults.mode);
            radio.closest('.radio-card')?.classList.toggle('active', radio.value === data.defaults.mode);
          });
        }
      }
    } catch (e) {
      console.warn('Could not fetch dataset info:', e);
    }
  }

  let setN, setT, setImgDur, setTimeoutSec;

  function bindLandingControls() {
    // Sync Number of images (n)
    setN = function(val) {
      const maxPairs = state.datasetInfo?.total_pairs || 26;
      val = Math.max(1, Math.min(maxPairs, parseInt(val, 10) || 1));
      dom.sliderN.value = val;
      dom.inputN.value = val;
      dom.valN.textContent = val;
      state.config.n = val;

      // Update preset active state
      dom.presetsN.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('active', parseInt(c.dataset.val, 10) === val);
      });
    };

    dom.sliderN.addEventListener('input', e => setN(e.target.value));
    dom.inputN.addEventListener('change', e => setN(e.target.value));
    dom.presetsN.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (chip && chip.dataset.val) setN(chip.dataset.val);
    });

    // Sync Interval time (t)
    setT = function(val) {
      val = Math.max(50, Math.min(5000, parseInt(val, 10) || 80));
      dom.sliderT.value = val;
      dom.inputT.value = val;
      dom.valT.textContent = `${val} ms`;
      state.config.t = val;

      dom.presetsT.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('active', parseInt(c.dataset.val, 10) === val);
      });
    };

    dom.sliderT.addEventListener('input', e => setT(e.target.value));
    dom.inputT.addEventListener('change', e => setT(e.target.value));
    dom.presetsT.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (chip && chip.dataset.val) setT(chip.dataset.val);
    });

    // Present image duration
    setImgDur = function(val) {
      if (val === 'sync') {
        val = state.config.t;
      } else {
        val = Math.max(50, Math.min(5000, parseInt(val, 10) || 240));
      }
      dom.sliderImgDur.value = val;
      dom.inputImgDur.value = val;
      dom.valImgDur.textContent = `${val} ms`;
      state.config.imgDuration = val;

      dom.presetsImgDur.querySelectorAll('.chip').forEach(c => {
        c.classList.toggle('active', c.dataset.val === String(val) || (c.dataset.val === 'sync' && val === state.config.t));
      });
    };

    dom.sliderImgDur.addEventListener('input', e => setImgDur(e.target.value));
    dom.inputImgDur.addEventListener('change', e => setImgDur(e.target.value));
    dom.presetsImgDur.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (chip && chip.dataset.val) setImgDur(chip.dataset.val);
    });

    // Timeout (seconds)
    setTimeoutSec = function(val) {
      val = Math.max(5, Math.min(300, parseInt(val, 10) || 60));
      if (dom.sliderTimeout) dom.sliderTimeout.value = val;
      if (dom.inputTimeout) dom.inputTimeout.value = val;
      if (dom.valTimeout) dom.valTimeout.textContent = `${val} s`;
      state.config.timeoutSec = val;
    };

    if (dom.sliderTimeout) dom.sliderTimeout.addEventListener('input', e => setTimeoutSec(e.target.value));
    if (dom.inputTimeout) dom.inputTimeout.addEventListener('change', e => setTimeoutSec(e.target.value));

    // Tolerance
    dom.sliderTolerance.addEventListener('input', e => {
      const val = parseInt(e.target.value, 10);
      dom.valTolerance.textContent = `${val} px`;
      state.config.tolerance = val;
    });

    // Checkboxes
    dom.chkShuffle.addEventListener('change', e => state.config.shuffle = e.target.checked);
    dom.chkFeedback.addEventListener('change', e => state.config.feedback = e.target.checked);
    dom.chkSound.addEventListener('change', e => state.config.sound = e.target.checked);

    // Radio modes
    document.querySelectorAll('input[name="param-mode"]').forEach(radio => {
      radio.addEventListener('change', e => {
        state.config.mode = e.target.value;
        document.querySelectorAll('.radio-card').forEach(card => card.classList.remove('active'));
        e.target.closest('.radio-card').classList.add('active');
      });
    });

    // Start button
    dom.btnStart.addEventListener('click', startExperiment);
    window.addEventListener('keydown', e => {
      if (state.screen === 'landing' && e.key === 'Enter') {
        startExperiment();
      }
    });
  }

  // --- Experiment Execution ---
  async function startExperiment() {
    dom.btnStart.disabled = true;
    dom.btnStart.textContent = 'Loading Stimuli...';

    try {
      const query = new URLSearchParams({
        n: state.config.n,
        shuffle: state.config.shuffle
      });

      const res = await fetch(`/api/pairs?${query.toString()}`);
      const data = await res.json();

      if (!data.trials || data.trials.length === 0) {
        alert('No trials returned from server. Check server connection.');
        dom.btnStart.disabled = false;
        dom.btnStart.textContent = 'Start Experiment';
        return;
      }

      state.trials = data.trials;
      state.currentTrialIndex = 0;
      state.trialResults = [];
      state.sessionStartTime = Date.now();
      state.sessionId = `session_${Date.now()}`;

      // Preload first 3 trials
      const preloadPromises = [];
      for (let i = 0; i < Math.min(3, state.trials.length); i++) {
        const t = state.trials[i];
        preloadPromises.push(preloadImage(`/images/${t.present_image}`));
        preloadPromises.push(preloadImage(`/images/${t.absent_image}`));
        preloadPromises.push(preloadImage(`/masks/${t.mask_image}`));
      }
      await Promise.all(preloadPromises);

      dom.btnStart.disabled = false;
      dom.btnStart.innerHTML = `<span>Start Experiment</span><span class="kbd-hint">Enter ↵</span>`;

      showScreen('experiment');
      updateHUD();
      runTrial(0);
    } catch (err) {
      console.error('Failed to launch experiment:', err);
      alert('Failed to load experiment: ' + err.message);
      dom.btnStart.disabled = false;
      dom.btnStart.innerHTML = `<span>Start Experiment</span><span class="kbd-hint">Enter ↵</span>`;
    }
  }

  function updateHUD() {
    const total = state.trials.length;
    const current = state.currentTrialIndex + 1;
    dom.hudCurrentTrial.textContent = Math.min(current, total);
    dom.hudTotalTrials.textContent = total;
    dom.hudProgressFill.style.width = `${((current - 1) / total) * 100}%`;

    // Calculate running accuracy and mean RT
    if (state.trialResults.length > 0) {
      const correct = state.trialResults.filter(r => r.accurate).length;
      const acc = Math.round((correct / state.trialResults.length) * 100);
      dom.hudAccVal.textContent = `${acc}%`;

      const rts = state.trialResults.filter(r => r.response_time_ms != null).map(r => r.response_time_ms);
      if (rts.length > 0) {
        const meanRt = Math.round(rts.reduce((a, b) => a + b, 0) / rts.length);
        dom.hudRtVal.textContent = `${meanRt} ms`;
      }
    } else {
      dom.hudAccVal.textContent = `--%`;
      dom.hudRtVal.textContent = `-- ms`;
    }
  }

  function setHUDState(phase, text) {
    dom.hudStateBadge.className = `state-badge ${phase}`;
    dom.hudStateText.textContent = text;
  }

  function updateTimeoutHUD() {
    if (!dom.hudTimerVal) return;
    dom.hudTimerVal.textContent = `${state.remainingSeconds}s`;
    if (state.remainingSeconds <= 10) {
      dom.hudTimerVal.style.color = '#ef4444';
      dom.hudTimerVal.style.fontWeight = '700';
    } else {
      dom.hudTimerVal.style.color = '';
      dom.hudTimerVal.style.fontWeight = '';
    }
  }

  function startTrialTimeout() {
    clearTimeout(state.trialTimeoutTimer);
    clearInterval(state.countdownInterval);

    const limit = state.config.timeoutSec || 60;
    state.remainingSeconds = limit;
    updateTimeoutHUD();

    state.countdownInterval = setInterval(() => {
      if (state.trialState !== 'absent') {
        clearInterval(state.countdownInterval);
        return;
      }
      state.remainingSeconds--;
      updateTimeoutHUD();
      if (state.remainingSeconds <= 0) {
        clearInterval(state.countdownInterval);
      }
    }, 1000);

    state.trialTimeoutTimer = setTimeout(() => {
      if (state.trialState !== 'absent') return;
      handleTrialTimeout();
    }, limit * 1000);
  }

  function handleTrialTimeout() {
    clearTimeout(state.trialTimeoutTimer);
    clearInterval(state.countdownInterval);
    clearTimeout(state.phaseTimer);
    clearInterval(state.flickerTimer);

    // 1 minute (or configured timeout) of inactivity expired without user click!
    const rt = window.performance.now() - state.stimulusStartTime;
    state.currentClick = {
      accurate: false,
      response_time_ms: rt,
      click_x: null,
      click_y: null,
      target_x: state.currentTrialData?.benchmark?.x ?? null,
      target_y: state.currentTrialData?.benchmark?.y ?? null,
      distance_px: null,
      skipped: true,
      timed_out: true
    };

    // Record trial data
    const trial = state.currentTrialData;
    state.trialResults.push({
      trial_index: state.currentTrialIndex + 1,
      id: trial.id,
      trial_str: trial.trial_str,
      prefix: trial.prefix,
      side: trial.side,
      category: trial.category,
      object_name: trial.object_name,
      present_image: trial.present_image,
      absent_image: trial.absent_image,
      mask_image: trial.mask_image,
      benchmark: trial.benchmark,
      ...state.currentClick
    });

    playSound('miss');

    // Show blank grey screen with white plus sign in exact center for 1 exact second, then advance automatically
    showFixationScreen(() => {
      runTrial(state.currentTrialIndex + 1);
    });
  }

  function showFixationScreen(onComplete) {
    state.trialState = 'fixation';
    setHUDState('fixation', 'Fixation (+)');

    // Paint stage canvas neutral grey (#808080) with centered white plus sign
    displayCtx.fillStyle = '#808080';
    displayCtx.fillRect(0, 0, 1024, 768);
    displayCtx.strokeStyle = '#ffffff';
    displayCtx.lineWidth = 4;
    displayCtx.lineCap = 'square';
    displayCtx.beginPath();
    displayCtx.moveTo(512, 384 - 16);
    displayCtx.lineTo(512, 384 + 16);
    displayCtx.moveTo(512 - 16, 384);
    displayCtx.lineTo(512 + 16, 384);
    displayCtx.stroke();

    // Show full-screen neutral grey overlay with white fixation cross
    if (dom.fixationOverlay) {
      dom.fixationOverlay.classList.add('active');
    }

    // Hide other overlays and prompts
    dom.blackOverlay.classList.remove('active');
    dom.feedbackOverlay.classList.remove('visible');
    dom.clickMarker.className = 'click-marker';
    dom.spacebarPrompt.classList.remove('active');
    dom.feedbackMsg.textContent = 'Fixation point';

    // Hold for exactly 1.0 second (1000 ms), then automatically proceed to next trial
    clearTimeout(state.fixationTimer);
    state.fixationTimer = setTimeout(() => {
      if (dom.fixationOverlay) {
        dom.fixationOverlay.classList.remove('active');
      }
      if (typeof onComplete === 'function') {
        onComplete();
      }
    }, 1000);
  }

  // Run a single trial
  async function runTrial(index) {
    clearTimeout(state.phaseTimer);
    clearInterval(state.flickerTimer);
    clearTimeout(state.trialTimeoutTimer);
    clearInterval(state.countdownInterval);
    clearTimeout(state.fixationTimer);
    if (dom.fixationOverlay) {
      dom.fixationOverlay.classList.remove('active');
    }

    state.remainingSeconds = state.config.timeoutSec || 60;
    updateTimeoutHUD();

    if (index >= state.trials.length) {
      finishExperiment();
      return;
    }

    state.currentTrialIndex = index;
    state.currentTrialData = state.trials[index];
    state.currentClick = null;
    state.trialState = 'present';

    updateHUD();

    // Reset visual feedback elements
    dom.blackOverlay.classList.remove('active');
    dom.feedbackOverlay.classList.remove('visible');
    feedbackCtx.clearRect(0, 0, 1024, 768);
    dom.clickMarker.className = 'click-marker';
    dom.feedbackMsg.className = 'feedback-msg';
    dom.feedbackMsg.textContent = 'Locate the difference in the scene';
    dom.spacebarPrompt.classList.remove('active');

    // Preload next trial assets asynchronously
    if (index + 1 < state.trials.length) {
      const nextT = state.trials[index + 1];
      preloadImage(`/images/${nextT.present_image}`);
      preloadImage(`/images/${nextT.absent_image}`);
      preloadImage(`/masks/${nextT.mask_image}`);
    }

    const trial = state.currentTrialData;
    const presentImg = await preloadImage(`/images/${trial.present_image}`);
    const absentImg = await preloadImage(`/images/${trial.absent_image}`);
    const maskImg = await preloadImage(`/masks/${trial.mask_image}`);

    // Draw mask to offscreen canvas
    state.maskCtx.clearRect(0, 0, 1024, 768);
    state.maskCtx.drawImage(maskImg, 0, 0);

    // ================= PHASE 1: PRESENT IMAGE =================
    setHUDState('present', 'Viewing Scene (Present)');
    displayCtx.drawImage(presentImg, 0, 0);
    dom.blackOverlay.classList.remove('active');

    state.phaseTimer = setTimeout(() => {
      // ================= PHASE 2: BLACK INTERVAL (t ms) =================
      state.trialState = 'interval';
      setHUDState('interval', `Interval (${state.config.t} ms)`);
      dom.blackOverlay.classList.add('active');

      state.phaseTimer = setTimeout(() => {
        // ================= PHASE 3: ABSENT IMAGE =================
        state.trialState = 'absent';
        setHUDState('absent', 'Click Difference!');
        dom.blackOverlay.classList.remove('active');
        displayCtx.drawImage(absentImg, 0, 0);
        state.stimulusStartTime = window.performance.now();

        // Start 60-second trial timeout
        startTrialTimeout();

        // Handle Continuous Flicker Mode if chosen
        if (state.config.mode === 'continuous_flicker') {
          startFlickerCycle(presentImg, absentImg);
        }
      }, state.config.t);

    }, state.config.imgDuration);
  }

  function startFlickerCycle(presentImg, absentImg) {
    let showingPresent = false;

    function step() {
      if (state.trialState !== 'absent') return;

      // Blank
      dom.blackOverlay.classList.add('active');
      state.phaseTimer = setTimeout(() => {
        if (state.trialState !== 'absent') return;

        showingPresent = !showingPresent;
        displayCtx.drawImage(showingPresent ? presentImg : absentImg, 0, 0);
        dom.blackOverlay.classList.remove('active');

        state.phaseTimer = setTimeout(step, state.config.imgDuration);
      }, state.config.t);
    }

    state.phaseTimer = setTimeout(step, state.config.imgDuration);
  }

  function bindExperimentControls() {
    // Click on canvas
    dom.stageWrapper.addEventListener('click', handleStageClick);

    // Spacebar listener & escape
    window.addEventListener('keydown', handleGlobalKeydown);

    // Quit button
    dom.btnQuit.addEventListener('click', () => {
      if (confirm('Are you sure you want to exit the current experiment session?')) {
        clearTimeout(state.phaseTimer);
        clearInterval(state.flickerTimer);
        clearTimeout(state.trialTimeoutTimer);
        clearInterval(state.countdownInterval);
        clearTimeout(state.fixationTimer);
        if (dom.fixationOverlay) dom.fixationOverlay.classList.remove('active');
        showScreen('landing');
      }
    });
  }

  function handleStageClick(e) {
    // Clicks are active only in absent / feedback state
    if (state.trialState !== 'absent') return;

    const rt = window.performance.now() - state.stimulusStartTime;

    // Convert client coordinates to 1024x768 native coordinate system
    const rect = dom.displayCanvas.getBoundingClientRect();
    const scaleX = 1024 / rect.width;
    const scaleY = 768 / rect.height;

    const clickX = Math.round((e.clientX - rect.left) * scaleX);
    const clickY = Math.round((e.clientY - rect.top) * scaleY);

    if (clickX < 0 || clickX >= 1024 || clickY < 0 || clickY >= 768) return;

    // Check hit on mask
    const isHit = checkMaskHit(clickX, clickY, state.config.tolerance);

    // Calculate distance to benchmark center if available
    let distanceToTarget = null;
    const bench = state.currentTrialData.benchmark;
    if (bench && bench.x != null && bench.y != null) {
      const dx = clickX - bench.x;
      const dy = clickY - bench.y;
      distanceToTarget = Math.sqrt(dx * dx + dy * dy);
    }

    // Save current trial result
    state.currentClick = {
      accurate: isHit,
      response_time_ms: rt,
      click_x: clickX,
      click_y: clickY,
      target_x: bench?.x ?? null,
      target_y: bench?.y ?? null,
      distance_px: distanceToTarget,
      skipped: false
    };

    state.trialState = 'feedback';
    clearTimeout(state.phaseTimer);
    clearInterval(state.flickerTimer);
    clearTimeout(state.trialTimeoutTimer);
    clearInterval(state.countdownInterval);

    // Ensure absent image is displayed
    const absentImg = imageCache.get(`/images/${state.currentTrialData.absent_image}`);
    if (absentImg) {
      displayCtx.drawImage(absentImg, 0, 0);
      dom.blackOverlay.classList.remove('active');
    }

    // Position click marker
    const cssX = (clickX / 1024) * 100;
    const cssY = (clickY / 768) * 100;
    dom.clickMarker.style.left = `${cssX}%`;
    dom.clickMarker.style.top = `${cssY}%`;
    dom.clickMarker.className = `click-marker show ${isHit ? 'hit' : 'miss'}`;

    // Sound and UI feedback
    if (isHit) {
      playSound('hit');
      dom.feedbackMsg.className = 'feedback-msg correct';
      dom.feedbackMsg.textContent = `✓ Correct! Response Time: ${Math.round(rt)} ms`;
    } else {
      playSound('miss');
      dom.feedbackMsg.className = 'feedback-msg incorrect';
      dom.feedbackMsg.textContent = `✗ Missed! Response Time: ${Math.round(rt)} ms`;
    }

    // Reveal target mask overlay if feedback enabled
    if (state.config.feedback) {
      renderTargetRevealOverlay();
    }

    // Activate spacebar prompt
    dom.spacebarPrompt.classList.add('active');
    setHUDState('feedback', 'Press Spacebar to Advance');
  }

  function checkMaskHit(clickX, clickY, radius) {
    // In our verified masks:
    // Background = WHITE (255, 255, 255)
    // Target Difference Object = BLACK / DARK (RGB < 128)
    radius = Math.max(0, radius || 0);

    // Test bounding box within radius
    const startX = Math.max(0, clickX - radius);
    const endX = Math.min(1023, clickX + radius);
    const startY = Math.max(0, clickY - radius);
    const endY = Math.min(767, clickY + radius);
    const width = endX - startX + 1;
    const height = endY - startY + 1;

    const imgData = state.maskCtx.getImageData(startX, startY, width, height);
    const data = imgData.data;

    const rSquared = radius * radius;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const dx = (startX + x) - clickX;
        const dy = (startY + y) - clickY;
        if (dx * dx + dy * dy <= rSquared) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          // Dark pixel check (< 128)
          if (r < 128 && g < 128 && b < 128) {
            return true; // Target HIT!
          }
        }
      }
    }
    return false;
  }

  function renderTargetRevealOverlay() {
    feedbackCtx.clearRect(0, 0, 1024, 768);
    const maskData = state.maskCtx.getImageData(0, 0, 1024, 768);
    const overlayData = feedbackCtx.createImageData(1024, 768);

    const m = maskData.data;
    const o = overlayData.data;
    const total = 1024 * 768 * 4;

    for (let i = 0; i < total; i += 4) {
      const r = m[i];
      const g = m[i + 1];
      const b = m[i + 2];
      // If dark in mask (the target difference)
      if (r < 128 && g < 128 && b < 128) {
        o[i] = 6;       // Cyan R
        o[i + 1] = 182; // Cyan G
        o[i + 2] = 212; // Cyan B
        o[i + 3] = 180; // Alpha
      } else {
        o[i + 3] = 0;   // Transparent
      }
    }

    feedbackCtx.putImageData(overlayData, 0, 0);
    dom.feedbackOverlay.classList.add('visible');
  }

  function handleGlobalKeydown(e) {
    if (state.screen !== 'experiment') return;

    if (e.code === 'Space') {
      e.preventDefault(); // prevent scroll

      if (state.trialState === 'feedback') {
        // Spacebar after clicking: proceed to next
        advanceToNextTrial();
      } else if (state.trialState === 'absent') {
        // Spacebar pressed before clicking -> skipped/missed
        const rt = window.performance.now() - state.stimulusStartTime;
        state.currentClick = {
          accurate: false,
          response_time_ms: rt,
          click_x: null,
          click_y: null,
          target_x: state.currentTrialData.benchmark?.x ?? null,
          target_y: state.currentTrialData.benchmark?.y ?? null,
          distance_px: null,
          skipped: true
        };
        advanceToNextTrial();
      }
    } else if (e.code === 'Escape') {
      if (confirm('Return to landing page? Current progress will be lost.')) {
        clearTimeout(state.phaseTimer);
        clearInterval(state.flickerTimer);
        clearTimeout(state.trialTimeoutTimer);
        clearInterval(state.countdownInterval);
        clearTimeout(state.fixationTimer);
        if (dom.fixationOverlay) dom.fixationOverlay.classList.remove('active');
        showScreen('landing');
      }
    }
  }

  function advanceToNextTrial() {
    clearTimeout(state.trialTimeoutTimer);
    clearInterval(state.countdownInterval);
    clearTimeout(state.fixationTimer);
    if (dom.fixationOverlay) dom.fixationOverlay.classList.remove('active');
    playSound('advance');

    // Record trial data
    const trial = state.currentTrialData;
    const clickData = state.currentClick || {
      accurate: false,
      response_time_ms: null,
      click_x: null,
      click_y: null,
      target_x: trial.benchmark?.x ?? null,
      target_y: trial.benchmark?.y ?? null,
      distance_px: null,
      skipped: true
    };

    state.trialResults.push({
      trial_index: state.currentTrialIndex + 1,
      id: trial.id,
      trial_str: trial.trial_str,
      prefix: trial.prefix,
      side: trial.side,
      category: trial.category,
      object_name: trial.object_name,
      present_image: trial.present_image,
      absent_image: trial.absent_image,
      mask_image: trial.mask_image,
      benchmark: trial.benchmark,
      ...clickData
    });

    runTrial(state.currentTrialIndex + 1);
  }

  // --- Results Dashboard ---
  async function finishExperiment() {
    showScreen('results');

    const results = state.trialResults;
    const total = results.length;
    const hits = results.filter(r => r.accurate);
    const misses = results.filter(r => !r.accurate);

    const accuracyPct = total > 0 ? Math.round((hits.length / total) * 100) : 0;
    const validRts = results.filter(r => r.response_time_ms != null).map(r => r.response_time_ms);

    let meanRt = 0;
    let medianRt = 0;
    let fastestRt = null;
    let fastestItem = '--';

    if (validRts.length > 0) {
      meanRt = Math.round(validRts.reduce((a, b) => a + b, 0) / validRts.length);
      const sorted = [...validRts].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      medianRt = Math.round(sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
      fastestRt = Math.round(sorted[0]);

      const fastestTrial = results.find(r => Math.round(r.response_time_ms) === fastestRt);
      if (fastestTrial) fastestItem = fastestTrial.object_name;
    }

    // KPI values
    dom.resAccuracy.textContent = `${accuracyPct}%`;
    dom.resCorrectCount.textContent = `${hits.length} / ${total} correct`;
    dom.resMeanRt.textContent = `${meanRt} ms`;
    dom.resMeanRtSec.textContent = `${(meanRt / 1000).toFixed(2)} seconds`;
    dom.resMedianRt.textContent = `${medianRt} ms`;
    dom.resFastestRt.textContent = fastestRt ? `${fastestRt} ms` : '--';
    dom.resFastestItem.textContent = fastestItem;

    // Visual Field Breakdown
    const leftTrials = results.filter(r => r.side === 'L');
    const rightTrials = results.filter(r => r.side === 'R');

    function getFieldStats(arr) {
      if (arr.length === 0) return { acc: '--', rt: '--', count: 0 };
      const c = arr.filter(r => r.accurate).length;
      const acc = Math.round((c / arr.length) * 100);
      const rts = arr.filter(r => r.response_time_ms != null).map(r => r.response_time_ms);
      const rt = rts.length ? Math.round(rts.reduce((a, b) => a + b, 0) / rts.length) : '--';
      return { acc: `${acc}%`, rt: `${rt} ms`, count: arr.length };
    }

    const leftStats = getFieldStats(leftTrials);
    const rightStats = getFieldStats(rightTrials);

    dom.resLeftAcc.textContent = leftStats.acc;
    dom.resLeftRt.textContent = leftStats.rt;
    dom.resLeftCount.textContent = leftStats.count;

    dom.resRightAcc.textContent = rightStats.acc;
    dom.resRightRt.textContent = rightStats.rt;
    dom.resRightCount.textContent = rightStats.count;

    dom.resTotalBadge.textContent = `${total} Trials`;

    // Populate Table
    dom.trialsTbody.innerHTML = '';
    results.forEach((r, idx) => {
      const tr = document.createElement('tr');

      const outcomeBadge = r.accurate
        ? `<span class="pill-hit">✓ Correct</span>`
        : (r.skipped ? `<span class="pill-miss">⏭ Skipped</span>` : `<span class="pill-miss">✗ Missed</span>`);

      const rtText = r.response_time_ms != null ? `${Math.round(r.response_time_ms)} ms` : '--';
      const benchRt = r.benchmark?.rt_ms ? `${Math.round(r.benchmark.rt_ms)} ms` : '--';
      const coords = r.click_x != null ? `(${r.click_x}, ${r.click_y})` : '--';
      const dist = r.distance_px != null ? `${Math.round(r.distance_px)} px` : '--';

      tr.innerHTML = `
        <td><strong>#${idx + 1}</strong></td>
        <td><code>${r.object_name}</code></td>
        <td><span class="badge">${r.side || 'P'}</span></td>
        <td>${outcomeBadge}</td>
        <td><strong>${rtText}</strong></td>
        <td style="color: var(--text-dim);">${benchRt}</td>
        <td style="font-family: var(--font-mono); font-size: 0.85em;">${coords}</td>
        <td style="font-family: var(--font-mono);">${dist}</td>
        <td><button class="btn-inspect" data-idx="${idx}">Inspect</button></td>
      `;
      dom.trialsTbody.appendChild(tr);
    });

    // Save session payload to server
    const payload = {
      session_id: state.sessionId,
      timestamp: new Date().toISOString(),
      parameters: {
        n: state.config.n,
        t_interval_ms: state.config.t,
        image_duration_ms: state.config.imgDuration,
        mode: state.config.mode,
        tolerance_px: state.config.tolerance,
        shuffle: state.config.shuffle,
        feedback: state.config.feedback
      },
      summary: {
        total_trials: total,
        correct_count: hits.length,
        accuracy_percent: accuracyPct,
        mean_rt_ms: meanRt,
        median_rt_ms: medianRt,
        fastest_rt_ms: fastestRt,
        total_duration_sec: Math.round((Date.now() - state.sessionStartTime) / 1000)
      },
      trials: state.trialResults
    };

    try {
      await fetch('/api/save-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.warn('Failed to auto-save session on server:', e);
    }
  }

  function bindResultsControls() {
    dom.btnNewExperiment.addEventListener('click', () => {
      showScreen('landing');
    });

    dom.btnDownloadCsv.addEventListener('click', exportCsv);
    if (dom.btnDownloadXlsx) dom.btnDownloadXlsx.addEventListener('click', exportXlsx);
    dom.btnDownloadJson.addEventListener('click', exportJson);

    // Delegate inspect modal clicks
    dom.trialsTbody.addEventListener('click', e => {
      const btn = e.target.closest('.btn-inspect');
      if (btn && btn.dataset.idx != null) {
        openInspectModal(parseInt(btn.dataset.idx, 10));
      }
    });

    dom.btnCloseModal.addEventListener('click', () => {
      dom.inspectModal.classList.remove('active');
    });
    dom.inspectModal.addEventListener('click', e => {
      if (e.target === dom.inspectModal) dom.inspectModal.classList.remove('active');
    });
  }

  function openInspectModal(idx) {
    const trial = state.trialResults[idx];
    if (!trial) return;

    dom.modalTitle.textContent = `Trial #${idx + 1}: ${trial.object_name} (${trial.side} field)`;
    dom.modalImgPresent.src = `/images/${trial.present_image}`;
    dom.modalImgAbsent.src = `/images/${trial.absent_image}`;
    dom.modalImgMask.src = `/masks/${trial.mask_image}`;

    if (trial.click_x != null && trial.click_y != null) {
      dom.modalClickPin.style.display = 'block';
      dom.modalClickPin.style.left = `${(trial.click_x / 1024) * 100}%`;
      dom.modalClickPin.style.top = `${(trial.click_y / 768) * 100}%`;
      dom.modalClickPin.className = `modal-pin ${trial.accurate ? 'hit' : 'miss'}`;
    } else {
      dom.modalClickPin.style.display = 'none';
    }

    const rt = trial.response_time_ms ? `${Math.round(trial.response_time_ms)} ms` : 'Skipped';
    const outcome = trial.accurate ? '✓ Correct Hit' : '✗ Missed';

    dom.modalStats.innerHTML = `
      <div>Outcome: <strong>${outcome}</strong></div>
      <div>Response Time: <strong>${rt}</strong></div>
      <div>Click Coordinates: <strong>${trial.click_x != null ? `(${trial.click_x}, ${trial.click_y})` : 'None'}</strong></div>
      <div>Benchmark Center: <strong>${trial.target_x != null ? `(${trial.target_x}, ${trial.target_y})` : '--'}</strong></div>
      <div>Error Distance: <strong>${trial.distance_px != null ? Math.round(trial.distance_px) + ' px' : '--'}</strong></div>
    `;

    dom.inspectModal.classList.add('active');
  }

  function triggerDownload(url, filename) {
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    if (filename) a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      if (a.parentNode) a.parentNode.removeChild(a);
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }, 1500);
  }

  function exportCsv() {
    if (state.sessionId) {
      triggerDownload(`/api/download/${state.sessionId}/csv`, `change_blindness_${state.sessionId}.csv`);
      return;
    }

    const trials = state.trialResults;
    if (!trials.length) return;

    const headers = [
      'trial_index',
      'id',
      'object_name',
      'side',
      'category',
      'accurate',
      'response_time_ms',
      'click_x',
      'click_y',
      'target_x',
      'target_y',
      'distance_px',
      'skipped',
      'present_image',
      'absent_image',
      'mask_image',
      'interval_t_ms',
      'image_duration_ms'
    ];

    const rows = [headers.join(',')];
    trials.forEach(t => {
      rows.push([
        t.trial_index,
        `"${t.id}"`,
        `"${t.object_name}"`,
        `"${t.side}"`,
        `"${t.category}"`,
        t.accurate ? 1 : 0,
        t.response_time_ms != null ? t.response_time_ms.toFixed(1) : '',
        t.click_x != null ? t.click_x : '',
        t.click_y != null ? t.click_y : '',
        t.target_x != null ? t.target_x : '',
        t.target_y != null ? t.target_y : '',
        t.distance_px != null ? t.distance_px.toFixed(1) : '',
        t.skipped ? 1 : 0,
        `"${t.present_image}"`,
        `"${t.absent_image}"`,
        `"${t.mask_image}"`,
        state.config.t,
        state.config.imgDuration
      ].join(','));
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `change_blindness_${state.sessionId || 'results'}.csv`);
  }

  async function exportXlsx() {
    // If session is saved on server, use direct download endpoint
    if (state.sessionId) {
      triggerDownload(`/api/download/${state.sessionId}/xlsx`, `change_blindness_${state.sessionId}.xlsx`);
      return;
    }

    const trials = state.trialResults;
    if (!trials.length) return;

    // Client-side Excel SpreadsheetML XML fallback
    const headers = [
      'trial_index', 'id', 'object_name', 'side', 'category', 'accurate',
      'response_time_ms', 'click_x', 'click_y', 'target_x', 'target_y',
      'distance_px', 'skipped', 'present_image', 'absent_image', 'mask_image',
      'interval_t_ms', 'image_duration_ms'
    ];

    let xml = '<?xml version="1.0"?>\n' +
      '<?mso-application progid="Excel.Sheet"?>\n' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"\n' +
      ' xmlns:o="urn:schemas-microsoft-com:office:office"\n' +
      ' xmlns:x="urn:schemas-microsoft-com:office:excel"\n' +
      ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"\n' +
      ' xmlns:html="http://www.w3.org/TR/REC-html40">\n' +
      ' <Worksheet ss:Name="Trial Results">\n' +
      '  <Table>\n' +
      '   <Row>\n';

    headers.forEach(h => {
      xml += `    <Cell><Data ss:Type="String">${h}</Data></Cell>\n`;
    });
    xml += '   </Row>\n';

    trials.forEach(t => {
      xml += '   <Row>\n' +
        `    <Cell><Data ss:Type="Number">${t.trial_index}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="String">${t.id}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="String">${t.object_name}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="String">${t.side || ''}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="String">${t.category || ''}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="Number">${t.accurate ? 1 : 0}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="${t.response_time_ms != null ? 'Number' : 'String'}">${t.response_time_ms != null ? t.response_time_ms.toFixed(1) : ''}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="${t.click_x != null ? 'Number' : 'String'}">${t.click_x != null ? t.click_x : ''}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="${t.click_y != null ? 'Number' : 'String'}">${t.click_y != null ? t.click_y : ''}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="${t.target_x != null ? 'Number' : 'String'}">${t.target_x != null ? t.target_x : ''}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="${t.target_y != null ? 'Number' : 'String'}">${t.target_y != null ? t.target_y : ''}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="${t.distance_px != null ? 'Number' : 'String'}">${t.distance_px != null ? t.distance_px.toFixed(1) : ''}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="Number">${t.skipped ? 1 : 0}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="String">${t.present_image}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="String">${t.absent_image}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="String">${t.mask_image}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="Number">${state.config.t}</Data></Cell>\n` +
        `    <Cell><Data ss:Type="Number">${state.config.imgDuration}</Data></Cell>\n` +
        '   </Row>\n';
    });

    xml += '  </Table>\n </Worksheet>\n</Workbook>';

    const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `change_blindness_${state.sessionId || 'results'}.xls`);
  }

  function exportJson() {
    const payload = {
      session_id: state.sessionId,
      timestamp: new Date().toISOString(),
      parameters: state.config,
      trials: state.trialResults
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    triggerDownload(url, `change_blindness_${state.sessionId || 'results'}.json`);
  }

  // Run on page load
  window.addEventListener('DOMContentLoaded', init);

})();
