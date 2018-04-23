/* global mScore, URL */

mScore['Playback'] = function() {
  this.tempo          = 60; // is only used for single note playing; # single notes per minute (i.e. duration in seconds * 60)
  this.isPlaying      = false;
  this.SoundBytes     = new mScore.Queue(10); // AudioObjects queued for playing, will be started by the ticker
  this.Ticker         = undefined;
  this.AudioObjects   = [ ];   // list of allocated AudioObjects, some in use and some free for reuse
  this.iconHeight     = 14; // parameters for visual controls
  this.iconBarWidth   = 3;  //
  this.noPieceBarText = '(no piece loaded)';
  
  var AS = this.AudioSynth = new mScore.Playback.AudioSynth();
  AS.setTuning(); // default tuning = equal temperament
  AS.setVolume(.5);

  AS.loadModulationFunction.apply(AS, [[1,2], [1,4], [1,8], [1,.5], [1,.25], [.5,2], [.5,4], [.5,8], [.5,.5], [.5,.25]].
    map(function(AB) { // as a shortcut because there will be 10 functions of the same form
      return function(a,b,i,sampleRate,freq,x)
        { return a * Math.sin(b * Math.PI * ((i / sampleRate) * freq) + x); }.bind(null, AB[0], AB[1]); }) );

  AS.addInstrument(mScore.Playback.Instrument.createPiano());
  AS.addInstrument(mScore.Playback.Instrument.createOrgan());
  AS.addInstrument(mScore.Playback.Instrument.createGuitar());
  AS.addInstrument(mScore.Playback.Instrument.createEdm());
  AS._resizeCache();
};


// We generate audio data as WAV objects, which Microsoft Internet Explorer does not support (only MIME type MP3).
// There is only one last-ditch way which is a gruesome hack (using the outdated BGSOUND element) with very
// limited functionality, and even that one only works in iE >= 10.
// Detecting Internet Explorer (including version 11) is a gruesome hack all by itself.
// This is not making me happy!
if(!navigator.userAgent.match(/Trident|MSIE/)) {
  mScore.Playback['AudioObject'] = function() {
    this.El               = document.createElement('AUDIO');
    this.free             = true;
    this.duration         = undefined;
    this.onFinishCallback = undefined;
    this.isPlaying        = false;
    this.El.autoplay      = false;
    this.El.setAttribute('type', 'audio/wav'); // set correct MIME type
  };
  mScore.Playback.AudioObject['_onended'] = function() {
    if(this.onFinishCallback) { this.onFinishCallback();     this.onFinishCallback = undefined; }
    this.Stop();
  };
  mScore.Playback.AudioObject.prototype['Fill'] = function(Blob, onLoadCallback, onFinishCallback) {
    this.free = false;
    this.Blob = Blob;
    if(onLoadCallback)     this.El.onloadeddata = onLoadCallback.bind(this);
    this.onFinishCallback = onFinishCallback;
    this.El.onended = mScore.Playback.AudioObject._onended.bind(this);
    this.El.src = URL.createObjectURL(Blob);
    this.duration = Blob.duration;
  };
  mScore.Playback.AudioObject.prototype['Play'] = function() { this.isPlaying = true;     this.El.play(); }; // event handlers have already been set in *Fill*
  mScore.Playback.AudioObject.prototype['Stop'] = function() {
    if(this.free)     return;
    this.El.onended      = undefined;
    this.El.onloadeddata = undefined; // the object will likely be reused, so reset it
    if(this.isPlaying)   { this.isPlaying = false;     this.El.pause(); }
    window.URL.revokeObjectURL(this.El.src);
    //this.El.src = ''; // would trigger reloading which obviously fails
    this.free = true;
  };
} else {
  mScore.Playback['AudioObject'] = function() {
    this.El                = document.createElement('BGSOUND');
    this.free              = true;
    this.duration          = undefined;
    this.endTimer          = null;
    this.afterthoughtTimer = null;
    this.onFinishCallback  = undefined;
  };
  mScore.Playback.AudioObject.prototype['Fill'] = function(Blob, onLoadCallback, onFinishCallback) {
    this.free     = false;
    this.Blob     = Blob;
    this.URL      = URL.createObjectURL(Blob);
    this.El.src   = this.URL;
    this.duration = Blob.duration;
    this.onFinishCallback = onFinishCallback;
    // in Internet Explorer 11 the BGSOUND element has been mutilated and does not send any kind of events any more — there's no end to this misery!
    if(onLoadCallback)     onLoadCallback.call(this); // alright, a bit prematurely, but shouldn't be long, the object was in memory already
  };
  mScore.Playback.AudioObject['_afterthought'] = function() {
    this.endTimer = this.afterthoughtTimer = null; // has already ended naturally
    this.Stop();
  };
  mScore.Playback.AudioObject.prototype['Play'] = function() {
    document.body.appendChild(this.El); // This is the correct way to start playing. Curses be upon Microsoft!
    if(this.onFinishCallback)     this.endTimer = window.setTimeout(this.onFinishCallback.bind(this), this.duration);
    this.afterthoughtTimer = window.setTimeout(mScore.Playback.AudioObject._afterthought.bind(this),
                                               this.duration + 500); // half a second after the theoretical end of the sound, that should deal with any lag
  };
  mScore.Playback.AudioObject.prototype['Stop'] = function() {
    if(this.free)     return;
    if(this.endTimer)              window.clearTimeout(this.endTimer);
    if(this.afterthoughtTimer)     window.clearTimeout(this.afterthoughtTimer);
    this.El.src = ''; // discard the sound
    document.body.removeChild(this.El);
    window.URL.revokeObjectURL(this.URL); // this should also free the Blob for garbage collection
    this.free = true;
  };
}

mScore.Playback.prototype['getFreeAudioObject'] = function() {
  var I, i = 0, ie = this.AudioObjects.length;
  while(i < ie && !(I = this.AudioObjects[i++]).free);
  return (i === ie ? (this.AudioObjects[ie] = new mScore.Playback.AudioObject()) : I);
};


// Fills the specified DIV with playback controls. These are labelled with the usual symbols, which are pre-rendered with mScore's sprite framework.
mScore.Playback.prototype['createControls'] = function(Renderer, targetDiv, style) {
  /* First we create the sprites for the icons on the buttons */
  var This = this, SD, St, styleExpand = function() {
    var r = St.r || 0, rs = 0, ds = new mScore.P2d(0, 0);
    if(St.shadow)   { rs = St.shadow.r || 0;     ds.Set(St.shadow.dx || 0, St.shadow.dy || 0); }
    this.dl = Math.max(r, rs - ds.x);     this.dt = Math.max(r, rs - ds.y);     this.dr = Math.max(r, rs + ds.x);     this.db = Math.max(r, rs + ds.y);
  },   createSprite2 = function(name, st) {
    this.init();
    var Spr = new mScore.Renderer.Sprite(Renderer, name, this.Dim, this.Ref),   CT = Spr.CT;
    CT.beginPath();     mScore.drawSpritePath.call(CT, this.path, this);
    if(st.color)   CT.fillStyle = CT.strokeStyle = st.color;
    if(st.r)     { CT.lineWidth = st.r;     CT.stroke(); }
    CT.fill();
    if(st.shadow) {
      CT.beginPath();     CT.translate(st.shadow.dx, st.shadow.dy);     mScore.drawSpritePath.call(CT, this.path, this);
      CT.fillStyle = CT.strokeStyle = st.shadow.color;     CT.globalCompositeOperation = 'destination-over';
      if(st.r)     { CT.lineWidth = st.shadow.r;     CT.stroke(); }
      CT.fill();
    }
    return Spr;
  };
  SD = new Renderer.SpriteDescription('2/3*%w+%b+%dl', '%h/2+%dt', '4/3*%w+%dr', '%h/2+%db', 1, 0, 'TrpSc@%w/3@@%h/2@Rct-2-1$-3*%b/%w$D12M-20L1-111ZM10L4-141Z',
                                      { absoluteScale: true,   angle: 60,   h: this.iconHeight,   b: this.iconBarWidth,
                                        preInit: function() { this.w = this.h / (2 * Math.tan(Math.PI / 360 * this.angle));     styleExpand.call(this);   } });
  this.SprButtonRewind = [ createSprite2.call(SD, 'ButtonRewindEnabled',  (St = (style && style.enabled)  || { })).CA,
                           createSprite2.call(SD, 'ButtonRewindDisabled', (St = (style && style.disabled) || { })).CA ];
  SD = new Renderer.SpriteDescription('%w/3+%dl', '%h/2+%dt', '2/3*%w+%dr', '%h/2+%db', 1, 0, 'TrpSc@%w/3@@%h/2@D1M20L-1-1-11z',
                                      { absoluteScale: true,   angle: 50,   h: this.iconHeight,
                                        preInit: function() { this.w = this.h / (2 * Math.tan(Math.PI / 360 * this.angle));     styleExpand.call(this);   } });
  this.SprButtonPlay   = [ createSprite2.call(SD, 'ButtonPlayEnabled',    (St = (style && style.enabled)  || { })).CA,
                           createSprite2.call(SD, 'ButtonPlayDisabled',   (St = (style && style.disabled) || { })).CA ];
  SD = new Renderer.SpriteDescription('1.5*%b+%dl', '%h/2+%dt', '1.5*%b+%dr', '%h/2+%db', 1, 0, 'TrpSc@%b/2@@%h/2@D1Rct-3-1221-122',
                                      { absoluteScale: true,   h: this.iconHeight,   b: this.iconBarWidth,   preInit: styleExpand });
  this.SprButtonPause  = [ createSprite2.call(SD, 'ButtonPauseEnabled',   (St = (style && style.enabled)  || { })).CA,
                           createSprite2.call(SD, 'ButtonPauseDisabled',  (St = (style && style.disabled) || { })).CA ];
                          
  /* The rewind button */
  this.buttonRewind = document.createElement('BUTTON');     if(style && style.class)   this.buttonRewind.className = style.class;
  this.buttonRewind.setAttribute('TYPE',     'button');
  this.buttonRewind.setAttribute('TITLE',    'Rewind piece');
  this.buttonRewind.setAttribute('DISABLED', 'DISABLED');
  this.buttonRewind.appendChild(this.SprButtonRewind[1]);
  this.buttonRewind.onclick = function() {
    if(This.isPlaying)   This.stopPlaying();
    This.textCurBar.value = This.Piece.Bars[This.curBar = This.Piece.startBar].toString();
  };
  
  /* A text field which display the current bar number */
  this.textCurBar = document.createElement('INPUT');
  this.textCurBar.setAttribute('TYPE', 'TEXT');
  this.textCurBar.setAttribute('VALUE', this.noPieceBarText);
  this.textCurBar.setAttribute('DISABLED', 'DISABLED');
  this.textCurBar.onfocus = function( ) { if(This.isPlaying)   This.stopPlaying();
                                          This.textCurBar.value = This.curBar;
                                          This.textCurBar.setSelectionRange(0, This.textCurBar.value.length);   };
  This.textCurBar.onblur  = function( ) { var T = This.textCurBar.value.match(/\d+/);
                                          T = (T ? Math.min(This.Piece.Bars.length - 2, +T) : 0);
                                          if(T === 0 && This.Piece.startBar === 1)     T = 1;
                                          This.textCurBar.value = This.Piece.Bars[This.curBar = T].toString();   };
  this.textCurBar.onkeyup = function(e) { if(e.keyCode === 13)   This.textCurBar.onblur(); };
  
  /* The play button with additional icons to turn it into the pause button */
  this.buttonPlay = document.createElement('BUTTON');     if(style && style.class)   this.buttonPlay.className = style.class;
  this.buttonPlay.setAttribute('TYPE',     'button');
  this.buttonPlay.setAttribute('TITLE',    'Start playing');
  this.buttonPlay.setAttribute('DISABLED', 'DISABLED');
  this.buttonPlay.appendChild(this.SprButtonPlay[1]);
  this.buttonPlay['playState'] = function(isPlaying) { // of course it DISPLAYS the inverse state, because the button is for changing the state
    this.removeChild(this.firstChild);
    this.appendChild(This['SprButton' + (isPlaying ? 'Pause' : 'Play')][0]);
    this.setAttribute('TITLE', (isPlaying ? 'Pause' : 'Start') + ' playing');
  };
  this.buttonPlay.onclick = function() { if(!This.isPlaying)     This.playPiece(This.Piece);
                                         else                    This.stopPlaying();           };
  
  targetDiv.appendChild(this.buttonRewind);
  targetDiv.appendChild(this.textCurBar);
  targetDiv.appendChild(this.buttonPlay);
};


/*mScore.Playback.prototype['linkSimplePlayButton'] = function(targetButton, startCallBack, stopCallBack) {
  this.buttonPlay              = targetButton;
  this.buttonPlay['playState'] = function() { }; // button label stays the same while playing, you can provide callbacks to change it
  this.buttonPlay.onclick      = this.playPiece.bind(this);
  this.startCallBack           = startCallBack;
  this.stopCallBack            = stopCallBack;
};*/


mScore.Playback.prototype['loadPiece'] = function(Piece) {
  this.Piece  = Piece;
  this.curBar = Piece.startBar;
  if(this.textCurBar) {
    this.textCurBar.value = Piece.Bars[Piece.startBar].toString();
    this.textCurBar.removeAttribute('DISABLED');
  }
  if(this.buttonRewind) { this.buttonRewind.removeChild(this.buttonRewind.firstChild);
                          this.buttonRewind.appendChild(this.SprButtonRewind[0]);
                          this.buttonRewind.removeAttribute('DISABLED');                 }
  if(this.buttonPlay)   { this.buttonPlay.removeChild(this.buttonPlay.firstChild);
                          this.buttonPlay.appendChild(this.SprButtonPlay[0]);
                          this.buttonPlay.removeAttribute('DISABLED');               }
};
mScore.Playback.prototype['unloadPiece'] = function() {
  if(!this.Piece)   return; // nothing to unloadPiece
  this.Piece = null;
  if(this.textCurBar) {
    this.textCurBar.value = this.noPieceBarText;
    this.textCurBar.setAttribute('DISABLED', 'disabled');
  }
  if(this.buttonRewind) { this.buttonRewind.removeChild(this.buttonRewind.firstChild);
                          this.buttonRewind.appendChild(this.SprButtonRewind[1]);
                          this.buttonRewind.setAttribute('DISABLED', 'disabled');        }
  if(this.buttonPlay)   { this.buttonPlay.removeChild(this.buttonPlay.firstChild);
                          this.buttonPlay.appendChild(this.SprButtonPlay[1]);
                          this.buttonPlay.setAttribute('DISABLED', 'disabled');      }
};


// Item can be a Bar reference, a Chord reference or an array of Notes
mScore.Playback.prototype['produceSound'] = function(Item, fctLoaded, fctEnded) {
  if(fctLoaded === true)   fctLoaded = mScore.Playback.AudioObject.prototype.Play; // start playing immediately
  var Ch, C, Notes, i, ie, tempo;
  if(Item instanceof mScore.Bar) {
    Ch = Item.Ch;     Notes = [ ];
    tempo = Item.Piece.tempo * Item.Piece.baseBeat.tVal / 60;
    for(i = 0, ie = Ch.length;     i < ie;     ++i)
      if((C = Ch[i]).type.substring(0, 1) === 'C' /*&& !C.tieIn*/) // only chords can be played, obviously
        C.actualNote(undefined, true, Notes, true); // append notes to array *Notes*
  } else if(Item instanceof mScore.Chord) {
    tempo = this.tempo * mScore.valueBase / 60;
    Item.actualNote(undefined, false, Notes = [ ]);
  } else     { Notes = Item;     tempo = this.tempo * mScore.valueBase / 60; }
  C = this.AudioSynth.generate(this.Piece.playbackInstrument, Notes, tempo, Item.tLen); // returns a Blob object
  var AudioObject = this.getFreeAudioObject();
  AudioObject['Notes']    = Notes;
  AudioObject['Item']     = Item;
  AudioObject['Playback'] = this;
  AudioObject['barDuration'] = C.barDuration;
  AudioObject.Fill(C, fctLoaded, fctEnded);
  return AudioObject;
};


mScore.Playback.prototype['SetCurBar'] = function(barIdx) {
  this.curBar = barIdx;
  if(this.textCurBar)     this.textCurBar.value = this.Piece.Bars[this.curBar].toString();
};


(function() {
  var _playScheduleNext = function() {
    var AA = this.SoundBytes.pop();
    if(!AA)   { this.stopPlaying();     return; } // if there's nothing to play we have reached the end and there's nothing to schedule either
    AA.Play(); // first start playing, then create the next sound byte
    this.SetCurBar(AA.Item.idx);
    // if there is only one bar, we still allow the ticker to be started, so that *stopPlaying* gets called in the usual way
    if(!this.Ticker)
      (this.Ticker = { interval : AA.barDuration,
                       callback : _playScheduleNext.bind(this),
                       id       : null }).id                    = window.setInterval(this.Ticker.callback, this.Ticker.interval);
    else if(AA.barDuration !== this.Ticker.interval) { // e.g. meter change in the current bar
      window.clearInterval(this.Ticker.id);
      this.Ticker.id = window.setInterval(this.Ticker.callback, this.Ticker.interval = AA.barDuration);
    }
    if(this.curBar < this.Piece.Bars.length - 1) {
      AA = this.produceSound(this.Piece.Bars[this.curBar + 1]); // schedule the next bar; *curBar* marks the currently PLAYING bar
      this.SoundBytes.push(AA);
    }
  };

mScore.Playback.prototype['playPiece'] = function() {
  if(this.isPlaying || !this.Piece)     return;
  if(this.buttonPlay)   this.buttonPlay.playState(true);
  if(this.startCallBack)   this.startCallBack.call(this);
  //console.log('Play piece, starting at ' + this.Piece.Bars[this.curBar]);
  this.isPlaying = true;
  // create the first bar and push it onto the queue, it will be played as soon as it's been loaded
  this.SoundBytes.push(this.produceSound(this.Piece.Bars[this.curBar],
                                         function() { _playScheduleNext.call(this.Playback); }));
};
})();


mScore.Playback.prototype['stopPlaying'] = function() {
  if(!this.isPlaying)     return;
  this.isPlaying = false;
  if(this.Ticker)   { window.clearInterval(this.Ticker.id);     this.Ticker = undefined; }
  if(this.buttonPlay)   this.buttonPlay.playState(false);
  for(var i = 0, AA;     i < this.AudioObjects.length;     ++i)
    if(!(AA = this.AudioObjects[i]).free)     AA.Stop(); // stop playing and discard the sound byte
  this.SoundBytes.clear();
  if(this.curBar >= this.Piece.Bars.length - 1)     this.SetCurBar(this.Piece.startBar);
  if(this.stopCallBack)     this.stopCallBack.call(this);
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

(function() {
	var URL = window.URL || window.webkitURL;
	var Blob = window.Blob;
	if(!URL || !Blob) throw new Error('This browser does not support AudioSynth');

	var AudioSynthInstance = null;
	var pack = function(c,arg) {
	  return [new Uint8Array([arg, arg >> 8]), new Uint8Array([arg, arg >> 8, arg >> 16, arg >> 24])][c];
	};
	var setPrivateVar = function(n,v,w,e) { Object.defineProperty(this,n,{value:v,writable:!!w,enumerable:!!e}); };
	var setPublicVar  = function(n,v,w)   { setPrivateVar.call(this,n,v,w,true); };

	// creating class AudioSynth
	mScore.Playback['AudioSynth'] = function() {
	  if(AudioSynthInstance instanceof mScore.Playback.AudioSynth) return AudioSynthInstance;
	  else                                          { this.__init__(); return this; }
	};
	setPriv = setPrivateVar.bind(mScore.Playback.AudioSynth.prototype);
	setPub  = setPublicVar.bind (mScore.Playback.AudioSynth.prototype);
	setPriv('_debug',         false, true);
	setPriv('_bitsPerSample', 16);
  setPub('InstrumentFinder', { });
	setPriv('_channels',      1);
	setPriv('_sampleRate',    44100, true);
	setPub ('setSampleRate',  function(v) {
		this._sampleRate = Math.max(Math.min(v | 0, 44100), 4000);
		this._clearCache();
		return this._sampleRate;
	});
	setPub ('getSampleRate',  function() { return this._sampleRate; });
	setPriv('_volume',        32768,true);
	setPub ('setVolume',      function(v) {
		v = parseFloat(v); if(isNaN(v)) { v = 0; }
		v = Math.round(v*32768);
		this._volume = Math.max(Math.min(v|0,32768), 0);
		this._clearCache();
		return this._volume;
	});
	setPub('getVolume', function() { return Math.round(this._volume/32768*10000)/10000; });
  // tuning is either the name of a pre-defined tuning or an array of 12 frequencies for a custom tuning
  setPub('setTuning', function(Tuning) {
    switch(Tuning || 'equal') {
      case 'equal':
        Tuning = [ 261.63, 277.18, 293.66, 311.13, 329.63, 346.23, 369.99, 392.00, 415.30, 440.00, 466.16, 493.88 ];
        break;
    }
    this._notes = Tuning;
    //setPriv('_notes', Tuning, true); // writable so it can be switched
  });
	setPriv('_fileCache',   [ ], true);
	setPriv('_temp',        { }, true);
	setPriv('Instruments',      [ ], true);
	setPriv('_mod',         [ function(i,s,f,x) { return Math.sin((2 * Math.PI)*(i/s)*f+x); } ]);
	setPriv('_resizeCache', function() {
		var f = this._fileCache;
		var l = this.Instruments.length;
		while(f.length<l) {
			var octaveList = [];
			for(var i = 0; i < 8; i++) {
				var noteList = {};
				for(var k in this._notes) {
					noteList[k] = {};
				} 
				octaveList.push(noteList);
			}
			f.push(octaveList);
		}
	});
	setPriv('_clearCache', function() {
		this._fileCache = [];
		this._resizeCache();
	});
  
  
  mScore.Playback.AudioSynth.prototype['addInstrument'] = function(Instrument) {
    this.Instruments.push(Instrument);
    this.InstrumentFinder[Instrument.name] = Instrument;
  };
  
  
  // returns a newly allocated Blob holding a WAV object with an added *duration* field (miliseconds)
  mScore.Playback.AudioSynth.prototype['generate'] = function(instrument, Note, tempo, tLen) {
    var N, t, pitch, octave;
    var Instrument = this.InstrumentFinder[instrument] || this.Instruments[0];
    var waveBind;
    
    // to be called on a Uint16Array buffer view
    /*var defaultFillFunc = function(start, duration, sRate, Instrument, freq, vol, waveFunc) {
      vol *= .25;
      var attack = Instrument.attack(sRate, freq, vol), dampen = Instrument.dampen(sRate, freq, vol);
      var i = 0, ie, x1, x2;
      start = Math.floor(start * sRate);
      
      // attack: linear volume increase
      x1 = Math.ceil(attack * sRate);
      for(ie = Math.min(x1, this.length - start), x1 = vol / x1;     i < ie;     ++i)
        this[i + start] += i * x1 * waveFunc.call(waveBind, i, sRate, freq, vol);

      // decay
      x1 = duration / (duration - attack);     x2 = 1 / (sRate * (duration - attack));
      for(ie = Math.min(Math.ceil(duration * sRate), this.length - start);     i < ie;     i++)
        this[i + start] += vol * Math.pow(x1 - x2 * i, dampen) * waveFunc.call(waveBind, i, sRate, freq, vol);
      console.log('dampen = '+dampen+',     ending at ' + Math.pow(x1 - x2 * i, dampen));
    };*/
    
    // to be called on a Uint16Array buffer view
    var FillFunc2 = function(start, duration, sRate, Instrument, freq, vol, wave) {
      //console.log([start, duration, sRate, Instrument, freq, vol, wave]);
      vol *= .15;
      var attack  = Math.ceil(Instrument.attack(sRate, freq, vol));
      var decay   = Math.floor(15 * sRate) + attack; // end of the decay part
      var sustain = 0 * vol; // sustain level after the end of the decay phase
      var release = Math.ceil((duration - .05) * sRate); // release point
      var i = 0, ie, x1;
      start    = Math.floor(start * sRate);
      duration = Math.floor(duration * sRate);
      
      // attack phase: linear volume increase
      x1 = vol / attack;
      for(ie = Math.min(attack, this.length - start);             i < ie;     ++i)
        this[i + start] += (i * x1) * wave(i, sRate, freq, vol);

      // decay phase: until begin of sustain, release or end of buffer, whichever comes first
      x1 = (vol - sustain) / (decay - i);
      for(ie = Math.min(decay, release, this.length - start);     i < ie;     i++)
        this[i + start] += (x1 * (decay - i) + sustain) * wave(i, sRate, freq, vol);
      
      // sustain phase; possibly skipped because the release happens before it
      x1 = (x1 * (decay - i) + sustain); // end value of the decay phase; either the sustain level, or we reached the release before that
      for(ie = Math.min(release, this.length - start);            i < ie;     ++i)
        this[i + start] += sustain * wave(i, sRate, freq, vol);
      
      // release phase: linear drop to zero
      x1 = x1 / (duration - release);
      for(ie = Math.min(duration, this.length - start);           i < ie;     ++i)
        this[i + start] += (x1 * (ie - i)) * wave(i, sRate, freq, vol);
    };

    var duration = 0, sR = this._sampleRate;
    for(i = 0, ie = Note.length;     i < ie;     ++i) {
      octave = Math.floor((pitch = (N = Note[i]).semitonePitch()) / 12);
      pitch -= octave * 12;
      octave = Math.min(8, Math.max(1, octave + 4));
      N['start']  = (N.tAt  || 0)                / tempo;
      N['length'] = (N.tVal || mScore.valueBase) / tempo;
      N['freq']   = this._notes[pitch] * Math.pow(2, octave - 4);
      if((t = N.start + N.length) > duration)     duration = t;
    }
    var buf  = new ArrayBuffer(2 * Math.ceil(sR * duration)); // double sample rate because of type Uint16
    var data = new Uint16Array(buf);
  
    for(i = 0;     i < ie;     ++i) {
      waveBind = { modulate: this._mod, vars: { } };
      /*defaultFillFunc*/FillFunc2.call(data, (N = Note[i]).start, N.length, sR, Instrument, N.freq, this._volume, Instrument.wave.bind(waveBind));
    }

    t = this._channels * this._bitsPerSample / 8;
    var out = [
      'RIFF',   pack(1, 4 + (8 + 24/* chunk 1 length */) + (8 + 8/* chunk 2 length */)), // Length
      'WAVE',
      'fmt ', // chunk 1
      pack(1, 16), // Chunk length
      pack(0, 1), // Audio format (1 is linear quantization)
      pack(0, this._channels),
      pack(1, sR),
      pack(1, sR * t), // Byte rate
      pack(0, t),
      pack(0, this._bitsPerSample),
      'data', // chunk 2
      pack(1, data.length * t), // Chunk length
      new Uint8Array(buf)
    ];
    var B = new Blob(out, { type: 'audio/wav' });
    B['duration']    = Math.ceil(duration * 1000); // in miliseconds
    B['barDuration'] = Math.ceil((tLen || duration) / tempo * 1000);
    return B;
  };
  
	setPriv('__init__', function(){
		this._resizeCache();
    this.baseOctave = 4;
	});
	
	// takes any number of arguments == modulation functions
	setPub('loadModulationFunction', function() {
		for(var i=0,ie=arguments.length;i<ie;i++) {
			f = arguments[i];
			if(typeof f !== 'function') throw new Error('Invalid modulation function.');
			this._mod.push(f);
		}
		return true;
	});
})();

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

mScore.Playback['Instrument'] = function(name, attack, dampen, wave) {
  this.name   = name;
  this.attack = attack;
  this.dampen = dampen;
  this.wave   = wave;
};


mScore.Playback.Instrument['createPiano'] = function() { return new mScore.Playback.Instrument('piano',
  function() { return .002; },
	function(sampleRate, frequency, volume) { return Math.pow(0.5*Math.log((frequency*volume)/sampleRate),2)/4; },
	function(i, sampleRate, frequency) {
		var base = this.modulate[0];
		return this.modulate[1](
			i,
			sampleRate,
			frequency,
			Math.pow(base(i, sampleRate, frequency, 0), 2) +
				(0.75 * base(i, sampleRate, frequency, 0.25)) +
				(0.1 * base(i, sampleRate, frequency, 0.5))
		);
	});
};


mScore.Playback.Instrument['createOrgan'] = function() { return new mScore.Playback.Instrument('organ',
	function() { return .3; },
	function(sampleRate, frequency) { return 1+(frequency * 0.01); },
	function(i, sampleRate, frequency) {
		var base = this.modulate[0];
		return this.modulate[1](
			i,
			sampleRate,
			frequency,
			base(i, sampleRate, frequency, 0) +
				0.5*base(i, sampleRate, frequency, 0.25) +
				0.25*base(i, sampleRate, frequency, 0.5)
		);
	});
};


mScore.Playback.Instrument['createGuitar'] = function() { return new mScore.Playback.Instrument('guitar',
	function() { return .002; }, // attack
	function() { return 1; }, // dampen
	function(i, sampleRate, frequency) { // wave
		var V = this.vars;
		V.valueTable = !V.valueTable ? [ ] : V.valueTable;
		if(V.playVal     === undefined)   V.playVal = 0;
		if(V.periodCount === undefined)   V.periodCount = 0;
		var valueTable  = V.valueTable;
		var playVal     = V.playVal;
		var periodCount = V.periodCount;
		var period      = sampleRate/frequency;
		var p_hundredth = Math.floor((period-Math.floor(period))*100);
		var resetPlay   = false;

		if(valueTable.length <= Math.ceil(period)) {
			valueTable.push(Math.round(Math.random())*2-1); // random value 1 or -1
			return valueTable[valueTable.length-1];
		} else {
			valueTable[playVal] = (valueTable[playVal>=(valueTable.length-1)?0:playVal+1] + valueTable[playVal]) * 0.5;
			if(playVal>=Math.floor(period)) {
				if(playVal<Math.ceil(period)) {
					if((periodCount%100)>=p_hundredth) { // Reset
						resetPlay = true;
						valueTable[playVal+1] = (valueTable[0] + valueTable[playVal+1]) * 0.5;
						V.periodCount++;	
					}
				} else resetPlay = true;	
			}
			var _return = valueTable[playVal];
			V.playVal = resetPlay ? 0 : V.playVal+1;
			return _return;
		}
	});
};


mScore.Playback.Instrument['createEdm'] = function() { return new mScore.Playback.Instrument('edm',
	function() { return .002; },
	function() { return 1; },
	function(i, sampleRate, frequency) {
		var base = this.modulate[0];
		var mod = this.modulate.slice(1);
		return mod[0](
			i,
			sampleRate,
			frequency,
			mod[9](
				i,
				sampleRate,
				frequency,
				mod[2](
					i,
					sampleRate,
					frequency,
					Math.pow(base(i, sampleRate, frequency, 0), 3) +
						Math.pow(base(i, sampleRate, frequency, 0.5), 5) +
						Math.pow(base(i, sampleRate, frequency, 1), 7)
				)
			) + mod[8](
					i,
					sampleRate,
					frequency,
					base(i, sampleRate, frequency, 1.75)
				)
		);
	});
};
