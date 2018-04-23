/* global mScore, Const */

/**********************************************************************************************************************/
/**                                               The namespace object                                               **/
/**********************************************************************************************************************/

// constructor
mScore.Renderer = function() {
  this.Const = {
    lineWidth              : 6,   // must be an even number, so half lines are integers!
    r                      : .05, // half thickness of note stems
    staveShift             : .1,  // (signed) vertical pixel amount by which the centers of stave lines are offset from whole numbers
    barlineShift           : .72, // (signed) horizontal pixel amount by which the centers of thin barlines are offset from whole numbers
    
    twoEndingFontSize      : 1.6,
    timeFontSize           : 1.8,
    staveSep               : 6,

    _stemLen : 200,
    _2PI     : 2 * Math.PI,

    Beam : {
      width                 : .4,  // beam thickness
      sep                   : .25, // space between beams
      stubWidth             : .7,  // length of beam stubs, e.g. after a dotted note
      maxSlope              : .6,  // too steep beams look bad
      ownColorWidth         : 1,   // width of the part of a beamed group around a note which keeps the note's color before gradients start
      supersamplingExponent : 2,
    },
    Tuplet : {
      fontSize          : 1.4,
      aroundNumberSpace : new mScore.P2d(.3, .4),
      bracketSpace      : new mScore.P2d(.5, .9),
      stubHeight        : .8
    },
    InputMarker : { rCorner   : 2,
                    fillStyle : 'rgba(200, 200, 200, 0.4)',
                    shape     : 'Trs$%x+(%rightOutcrop||0)$                0 An0$%yTop$   $%rCorner$270   0 0$%yBottom$$%rCorner$  0  90' +
                                'Trs$-(%rightOutcrop||0)-(%leftOutcrop||0)$0 An0$%yBottom$$%rCorner$ 90 180 0$%yTop$   $%rCorner$180 270'     }
  };
  
  // Every renderer instance needs its own copy of the SpriteDescription class so the class can use the renderer's *Const* object as prototype
  this.SpriteDescription = function(toL, toT, toR, toB, scale, Ref, path, extraParam) {
    this.toL = toL;     this.toT = toT;     this.toR = toR;     this.toB = toB;     this.scale0 = scale;     this.path = path;
    if(typeof Ref === 'number')   this.refY = Ref;
    else                        { this.refY = Ref.y;     this.refX = Ref.x; }
    if(extraParam)   for(var i in extraParam)     this[i] = extraParam[i];
  };
  this.SpriteDescription.prototype = this.Const;
  for(var attr in mScore.Renderer.SpriteDescriptionFunctions)   this.SpriteDescription.prototype[attr] = mScore.Renderer.SpriteDescriptionFunctions[attr];
  
  this.Spaces = {
    barIn               : 2,
    barOut              : 2,
    betweenChords       : 2.5,
    stemLength          : 2.5,
    beforeKey           : .7,
    beforeClef          : .7,
    beforeHeadBarline   : .7,
    chordShift          : .25,
    afterAccidental     : .25,
    twoEndingHookHeight : 2,
    twoEndingNumberOffs : new mScore.P2d(.5, .5),
    beforeTime          : 1,
    stubL               : .7,
    stubR               : .7
  };
  
  this['highlightColor'] = [ new mScore.ColorStyle('#803300'),
                             new mScore.ColorStyle('#ff751a'),
                             new mScore.ColorStyle('#6495ED') ];
  this['inputColor']     =   new mScore.ColorStyle('#CCCCFF');
  
  this.Sprites      = { }; // to be filled on *initialization()*
  this.Sprites2     = { }; // additional sprites, to be rendered when required
  this.TieEnd       = { };
  this.DigitSprites = [ {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {} ]; // for each digit + period. Contains sprites of different font sizes. Filled on demand.
  
  // just some shortcuts to simpify the creation of SpriteDescription objects
  var Const = this.Const, This = this, N;
  var SD = function(path /*, arguments */) {
    var E = Const, i = -1, yRef = 0, j;     path = path.split('.');
    while(++i < path.length - 1)     E = (E[path[i]] = (E[path[i]] || { }));
    if(typeof arguments[(j = 6)] !== 'string')    yRef = arguments[j++];
    (E = E[path[i]] = new This.SpriteDescription(arguments[1], arguments[2], arguments[3], arguments[4], arguments[5], yRef, arguments[j])).name = path[i];
    if(arguments.length > ++j)   for(i in (j = arguments[j]))     E[i] = j[i];
    return E;
  };
  var SDC = function(parent, name, extraParam) { (parent[name] = parent.derive(extraParam)).name = name;     return parent[name]; };
  
  /** define the Sprite description objects; they will be rendered into sprites upon calling *initialize()*   **/

  SD('Ledger', '%length/2', '%r', '%length/2', '%r', 1, new mScore.P2d('%Note.Cen0.x/%lineWidth', 0), 'TrpSc$%length/2$$%r$Rct-1-1 2 2', { length: 1.8 });
  N = SD('Stave', 0, '%r', '%_length/%lineWidth', '%r+%height', 1,   'Trs@%x0@@%Pvt.y@Sc@%x1-%x0@1 Rct0 0 1$%height$D1M01L11M02L12M03L13 %path1 Str$2*%r$',
         { _length: 200,   scndLine: 'D1M04L14M05L15Trs0$%height-4$D1M00L10M01L11M02L12M03L13',
           preInit: function() { this.x1 = this._length - (this.x0 = -2 * Math.ceil(this.r * this.lineWidth));
                                 if(this._mode && this._mode.long) { this.path1 = this.scndLine;     this.height = 9 + this.staveSep; }
                                 else                              { this.path1 = '';                this.height = 4;                 }   } });
  N = SDC(N, 'Barline', { space : .4,   dotSpace: .45,   dotR: .2,   _long: 200,   w1: 0,   w2: .4,   toL: '%r',   toR: '%r+%val(%W)',
                          refX: '%barlineShift/%lineWidth+%offsLeft',   thn: 'Rct$-%r$0$%w1+2*%r$$%height$Trs$%w1+%space$0',
                          thk: 'Rct$%_mode.linePos<0?0:-%r$0$%w2+(2-Math.abs(%_mode.linePos))*%r$$%height$Trs$%w2+%space$0', // thin and thick vertical bars
                          preInit:  function() { this.thn2 = (this._mode.linePos ? '' : this.thn);   this.pathL = (this._mode.linePos ? this.parentPath() : '');
                                                 this.offsLeft = (this.dotsLeft ? (Math.ceil((this.dotSpace + this.dotR) * this.lineWidth - this.barlineShift) +
                                                                                   this.barlineShift) / this.lineWidth  : 0);   },
                          postInit: function() { if(this._mode.linePos)
                                                   this['x' + ((this._mode.linePos+1)/2)] = this.Pvt.x + (this._mode.linePos > 0 ? this.valX(this.W) : 0); } });
  SDC(N, 'Single',   { W: '%w1',                  path: '%pathL Trp      %thn2' });
  SDC(N, 'Double',   { W: '%space+2*%w1',         path: '%pathL Trp %thn %thn2' });
  SDC(N, 'Triple',   { W: '%space+%w1+%w2',       path: '%pathL Trp %thn %thk'  });
  SDC(N, 'Begin',    { W: '%space+%w1+%w2',       path: '%pathL Trp %thk %thn',                          dotsRight: true });
  SDC(N, 'End',      { W: '%space+%w1+%w2',       path: '%pathL Trp %thn %thk',        dotsLeft: true                    });
  SDC(N, 'EndBegin', { W: '2*%space+2*%w1+%w2',   path: '%pathL Trp %thn %thk %thn',   dotsLeft: true,   dotsRight: true });
  var Par = { preInit: function() { this.offsLeft = (this.dotsLeft ? this.offsLeft - this.dotSpace : this.val(this.W) + this.dotSpace);
                                    if(this.dotsLeft && this.dotsRight)   { this.toR  += '+' + (this.W += '+2*%dotSpace');
                                                                            this.path += 'Tr$' + this.W + '$0Af0 0$%dotR$0 1$%dotR$'; }   },
              toL: '%dotR', toR: '%dotR', toT: '%dotR',   toB: '1+%dotR',  refY: 1.5, path: 'TrpAf0 0$%dotR$0 1$%dotR$' };
  ['Begin', 'End', 'EndBegin'].forEach(function(X) { SDC(N[X], 'Dots', Par); });

  SD('Clef.F', .633, 1, 2.35, 2.333, .01392, 1, 'TrcTrs-3.39-14.619X2M9f65C9faa68df0cfd04ff00fa07f837e694b4763f6704181e1c3f An48.8 86 31-132.241 122.907X2C02' +
                                                '5c0e2e231e4a009f099f65Z TrpAf!2.1!!-.5!!.25!!2.1!!.5!!.25!');
  SD('Clef.G', 1.48, 4.0, .939, 2.536, .026, 3, 'TrcTrs-1.891 0X2M3bbcC0ec10692167c2a5f4f4b512851174f0b46003c01330d2f152626283a2b4cL3cc2C3dc641dd3deb39f32efb' +
                                                '20f6Ap33.381 230.619 15.442 455.129 174.871X2C15ff2efe38f643ef44e043d4L2d3cC2b2c3b14470b4c13542731471a5c006f' +
                                                '029303a712ba26bf43c765b35e91597c4b7033741e7813911ea2Q27af2facC1d9f248736844b815291539d55aa4cba3bbcZ');
  this.Const.Clef['smallFactor'] = .9; // size factor for the small clef versions (for in-bar clef changes)


  (function(SlantCircle, slantTransform) {
    N = SD('Note', '%R.x', '%R.y', '%R.x', '%R.y', 1, new mScore.P2d('%Cen0.x/%lineWidth+%_mode.shiftOut*(2*%R.x-%r)', '%Cen0.y/%lineWidth'),
           'TrpSc$%flip$$%flip$ ' + slantTransform('R') + 'M1 0An0 0 1 0$%a0*360/%_2PI$ TrpSc$%flip$$%flip$ %pStem1 Z %Hollow',
           { Hollow: slantTransform('RHollow') + 'M1 0Ap0 0 1 0-360Z',   pStem: 'L$%R.x-2*%r$@-2*%Pvt.y@ $%R.x$@-2*%Pvt.y@',
             Cen0: new mScore.P2d(.5, 0),   R: SlantCircle(.55, .5, .4),   RHollow: SlantCircle(.3,  .35, -.2),
             preInit: function() { this.flip   = ((this.up = this._mode.up) ? 1 : -1);
                                   this.pStem1 = (!(this._mode.shiftOut || this._mode.up === undefined) ? this.pStem : '');
                                   this.a0     = 2 * Math.PI - (this.pStem1 ? Math.acos(1-2*this.r/this.R.x) : 0);
                                   var y = this.parent.staveShift + this.Cen0.y;
                                   this.top = Math.floor(y - this.lineWidth * this.R.y);     this.bottom = Math.ceil(y + this.lineWidth * this.R.y);   } });
    SDC(N, 'Full',    { R: SlantCircle(.7,  .5,  0),   RHollow: SlantCircle(.35, .4,  -.4),   pStem: '' });
    SDC(N, 'Half');          SDC(N, 'Quarter', { Hollow: '' });
  })(function(x, y, lam) { var E = new mScore.P2d(x, y);     E['lam'] = lam;     return E; },
     function(R)         { return 'Tfl$%_R.x$$-%_R.y*%_R.lam$0$%_R.y*Math.sqrt(1-%_R.lam*%_R.lam)$'.replace(/_R/g, R); });
  
  SDC(N, 'Stem', { refX: '%Cen0.x/%lineWidth+%flip*(%R.x-%r)',   toL: '%r',   toR: '%r',   path: 'Trs@%Pvt.x@0Rct$-%r$0$2*%r$@%Dim.y@',
                   postInit: function() { Const['stemShift' + (this._mode.up ? 'U' : 'D')] = this.Ref.x + this.Pvt.x;
                                          if(!this._mode.up)   this.Ref.y += this.Dim.y;     this.Dim.y = this._stemLen;   } });
  SDC(N, 'Flag', { toL: '%r',   toR: '%r*(1+73.186*%flagSizeFactor)',   flagSizeFactor: .17,   staveShift: 0,
                   scale0: '%r*%flagSizeFactor',   refX: '%Cen0.x/%lineWidth+%flip*(%R.x-%r)',   refY: '(%up?%top:%bottom)/%lineWidth',
                   path1: 'TrpTrs!%r!0Sc1$%flip$X2M0000C21233647365f36792c9427a0 Ap49.021 163.44 10.595 198.947 19.633X2C5d4939262b0e19-1000-3200-58 Trs0-88',
                   path2: 'X2C121434353459346233662b6dL3985C58553c2c2e161b-0700-2400-4a Trs0-74',   pathS: 'L!-2*%r!0 Trp L!-%r!0 Z',
                   preInit: function() { this[this.up ? 'toT' : 'toB'] = this.val(this.scale0) * (14 + this.nFlags * 74);
                                         this[this.up ? 'toB' : 'toT'] = this.val(this.scale0) * 174.036;                   } });
  // using seperate subsprites instead of modes to provide more freedom for customizing note design
  SDC(N.Flag,  '8', { nFlags: 1,   path: '%path1               %pathS' });     SDC(N.Flag, '16', { nFlags: 2,   path: '%path1 %path2               %pathS' });
  SDC(N.Flag, '32', { nFlags: 3,   path: '%path1 %path2 %path2 %pathS' });     SDC(N.Flag, '64', { nFlags: 4,   path: '%path1 %path2 %path2 %path2 %pathS' });

  N = SD('Dots', '%dotR', '%dotR', '%dotR+(%_mode-1)*(2*%dotR+%betweenDots)', '%dotR', 1,
         new mScore.P2d('%Nte.Cen0.x/%lineWidth+%Nte.R.x+%preDotSpace+%dotR', '%Nte.Cen0.y/%lineWidth'), '',
         { dotR: .2,   preDotSpace: .3,   betweenDots: .3,   path0: [ 'Trp', 'Af0 0$%dotR$Trs$2*%dotR+%betweenDots$0' ],   Nte: Const.Note,
           preInit: function() { this.path = this.path0[0];     for(var i = 0;   i < this._mode;   ++i)     this.path += this.path0[1];   } });
  SDC(N, 'FullNoteDots', { Nte: Const.Note.Full });


  N = SD('Accidental', 0, 0, 0, 0, 1, new mScore.P2d('-%Note.R.x-%afterAccidental-%toR', 0), '', { afterAccidental: .25 });
  SDC(N, 'Natural', { toL: .309, toT: 1.405, toR: .309, toB: 1.405, scale0: .0110124, path: 'TrcX2M383eL38ff2fff2fb700c300000800084b383eZM086cL08a12f962f61Z' });
  SDC(N, 'Sharp',   { toL: .419, toT: 1.405, toR: .419, toB: 1.405, scale0: .0110124, path: 'TrcX2M4caeL4c9400aa00c4ZM4c55L4c3b0051006cZM3a00L330033f43af4ZM190bL120b12ff19ffZ' });
  SDC(N, 'Flat',    { toL: .414, toT: 2.023, toR: .414, toB:  .698, scale0: .0106675, path: 'TrcX2M0a95C267945844b9a54b943cb37d4Q1be900ffL00000a00ZM149bC0e9f0aa30ac9L0aeb1ed8C3ebb298b149bZ' });
  SDC(N, 'Flat2',   { toL: .883, toT: 2.023, toR: .883, toB:  .698, scale0: .0106675, path: 'TrcX2M0a95C267945844b9a54b943cb37d4Q1be900ffL00000a00ZM149bC0e9f0aa30ac9L0aeb1ed8C3ebb298b149bZM6295C7e799d84a39aacb99bcb8fd4Q73e958ffL58006200ZM6c9bC669f62a362c9L62eb76d8C96bb818b6c9bZ' });
  SDC(N, 'Sharp2',  { toL: .456, toT:  .458, toR: .456, toB:  .458, scale0: .004,     path: 'TrcX2M7271C5b8647981b9711970b9b09a3Q03cd00f403fc0bff33fb5cf5C65f368ee68dd69b877a58f8ea479b369e368ed68f364f55cQfb32fe0bfb03f300cb04a20aC990c9611962296458a5a7271zM7090Cx28cad93b596dd96ee99f3a2f5Qcbfbf3fffbfcfef4fbcdf5a3Cf39bed97e397b897a98b8f7176576b4f68226811650c5c0aQ36040d000401000c0333095cC0b6411681b684d6857777090Z'});
  
  N = SD('Rest', .2838, '.2838+%nKnobs-1', '.7956+(%nKnobs-1)*%Vx', 1.6071, .0042172, '',
         { Vx: .27869,   path0: 'TrcTrs0!%nKnobs-1!Trs.963 27.816 M136.4 420.8L102.4 420.8',   path2: 'Trs!-%Vx!!1!X2Qe016ee00Lff00Z',
           path1: 'X2Lc35bQ7f7d5a7d0e790033 An66.49 39.64 67.46 170.305 382.083X2Q775e9653b745d127Trs!%Vx!!-1!',   block: new mScore.P2d(1.2, .5)   });
  SDC(N,  'R1',  { scale0: 1,   refY: 2,   toL: '%block.x/2',   toR: '%block.x/2',   toT: 0,   toB: '%block.y',   path: 'TrpRct$-%block.x/2$0$%block.x$$ %block.y$' });
  SDC(N,  'R2',  { scale0: 1,   refY: 2,   toL: '%block.x/2',   toR: '%block.x/2',   toB: 0,   toT: '%block.y',   path: 'TrpRct$-%block.x/2$0$%block.x$$-%block.y$' });
  SD('Rest.R4', .498, 1.462, .498, 1.463, .011471, 2, 'TrcTrs-35.26 0X2M2868C5c3948183500L43007a42C4b764d8c78beL73c5C61bc52b949c748c838e155f8L50ffC00c52a935cadZ');
  for(var i = 1, p = '%path0 %path1';     i <= 4;     ++i, p += ' %path1')     SDC(N, 'R' + (4 << i), { refY: 1.5,   nKnobs: i,   path: p + ' %path2' });
  

  SD('Digit.d0', 0, .946,  .6471, -.054,  .003498,  'TrcX2M0080C003b21005d009900b93db980b9b599ff5dff21ff00b40080ZM3280C32bd35f15df182f186c88680864f820f5d0e360d324d3280Z');
  SD('Digit.d1', 0, .952,  .521,  -.042,  .0035686, 'TrcX2M1089L00803400Q51086900L69dbQ69ea92eeL92ffQ4ff80dffL0df0Q35ea35dbL353dZ');
  SD('Digit.d2', 0, .9529, .6549, -.0392, .0039216, 'TrcTrs-11-12X2M115eC002d300c590c840ca822a84ea87589846b8e419c2fb328bd2eb83bb049b06cb071c98bc99ec9a4aba899Lb29aCb0c493f577f552f54bc933c921c91ae417f1L0bf1C0cca19a53e9353897673764e761e46122f37 An44.69 84.26 29.35-85.483 160.621Z');
  SD('Digit.d3', 0, .958,  .5807, -.05,   .0035608, 'TrcTrs-7.916 0M49 37An43.35 63.76 27.35-78.071 148.616X2C002d210054008400a518a533a55c896d74758f7dab90abbdabef7aff56ff28ff06e608bb An37.24 188.7 29.29-176.680 59.75X2C31ea41ed4fed66ed79cd79b679885e7e367eL3673C60737565753e7529690f4d0f440f32133125Z');    
  SD('Digit.d4', 0, .964,  .7161, -.06,   .0035451, 'TrcX2M62bcL06bc00b3Q3c5a4402680c9100L9808Q42871ca9L62a9627b903f9d3f9da9caa9cabc9dbc9debQ9df6b7f9Lb7ff4dff4df7Q62f562ebZ');
  SD('Digit.d5', 0, .9381, .5846, -.044,  .0035061, 'TrcTrs-5.276 0X2M1b7eL13791502Q62099800C971b783360334332262f254c2554275b365b3f5b43525f528452ac74aca1acdb77ff4cff20ff00e206b4 An33.38 183.62 27.62-172.479 82.479X2C24e93bec43ec5dec78d678a9785e3b5a1b7eZ');
  SD('Digit.d6', 0, .954,  .6198, -.056,  .0035216, 'TrcX2M0078C004426005e007f009c199c34 An127.4 51.43 28.6 1.133 235.012X2C6c0f610d5a0f321b33713389398046666c668d66b086b0b1b0da7dff59ff1fff00c60078ZM81baC819e7a7f5d7f467f339833b733d342ef58ef74ef80d081baZ');
  SD('Digit.d7', 0, .9661, .6748, -.0624, .0035702, 'TrcX2M006cL0c011501251dQ3b004f00C6f006e278b27Q9d27b206Lbd0aQ8c837bfc73ff69fa60f64afb40fe35fa5c96a2377e486848C50494d323a3216321263126eZ');
  SD('Digit.d8', 0, .96,   .633,  -.048,  .0035765, 'TrcX2M3e7fC239917aa17c217db32ee4dee6aee81d981c081a3529233831f79055f05480523280058008400a91aa93ba94e95627674L6f6cC825e8d4c8d3b8d22720d560d440d2d1e2d322d525c5e786b9a7bb196b1b0b1db8cff50ff22ff00e300c000a21592337cZ');
  SD('Digit.d9', 0, .944,  .6198, -.046,  .0035216, 'TrcX2Mb087Cb0bb8aff52ff31ff14e614cb An48.39 203.08 28.39-179.840 61.365X2C3fee4cf556ef80d57c927e7674836999449923990079004e001c2d0057009100b039b087ZM3350C33623c8051806b807e677e487e2c6e1058103c10332f3350Z');
  SD('Digit.d10', '%r', '%r', '%r', '%r', 1, new mScore.P2d('%r', '-%padBttm-%r'), 'TrcTrs$%r$$%r$Af0 0$%r$', { r: .1, padBttm: .05 });

  this.CTtemps = [ ];
};

/**************************************************************************************************************************************************************/
/**                                                            Sprites and Sprite description objects                                                        **/
/**************************************************************************************************************************************************************/

(function() {
  var pat      = /%(?=\w)/g,     pathPat = /\$[^\$]*\$|@[^@]*@|![^!]*!|%\w+/g;
  var _init = function(child, fctName) { if(this.parent && this.parent[fctName])   _init.call(this.parent, child, fctName);
                                         if(this.hasOwnProperty(fctName))   this[fctName].call(child);   }; // so that writing happens in the calling child
mScore.Renderer['SpriteDescriptionFunctions'] = {
  val : function(expression)    { return eval(expression.replace(pat, 'this.')); },
  valX: function(expression)    { return eval(expression.replace(pat, 'this.')) * this.lineWidth; },
  val2: function(expression)    { return (typeof expression === 'string' ? eval(expression.replace(pat, 'this.')) : expression); },
  init: function(scalingFactor) { // redo-safe, but only retains the most recent values
    // *Pvt*: sprite corner ——> sprite pivot;     *Crn*: sprite corner ——> local origin;     *Ref*: Ref point ——> sprite corner;     *Dim*: sprite pixel size
    var F;     if((F = this.preInit))   if(typeof F === 'string') this.value(F); else _init.call(this, this, 'preInit');
    scalingFactor = (scalingFactor || 1) * (F = (this.absoluteScale ? 1 : this.lineWidth));
    this.Pvt   = new mScore.P2d(this.val2(this.refX || 0) * F, this.staveShift + this.val2(this.refY) * F);
    this.Crn   = this.Pvt.cp().Sub(this.val2(this.toL) * scalingFactor, this.val2(this.toT) * scalingFactor);
    this.Ref   = this.Crn.cp().Map(Math.floor);     this.Crn.Sub(this.Ref);     this.Pvt.Sub(this.Ref);
    this.Dim   = this.Pvt.cp().Add(this.val2(this.toR) * scalingFactor, this.val2(this.toB) * scalingFactor).Map(Math.ceil);
    this.scale = this.val2(this.scale0) * scalingFactor;
    if((F = this.postInit))   if(typeof F === 'string') this.value(F); else _init.call(this, this, 'postInit');
  },
  createSprite: function(name, Renderer, scalingFactor, mode, supersampleExponent) { // *scalingFactor* may be omitted
    this._mode = (mode || 0);
    this.init(scalingFactor);
    var Spr = new mScore.Renderer.Sprite(Renderer, name, this.Dim, this.Ref);
    if(!supersampleExponent)   this.paint(Spr.CT);
    else {
      var fac = 1 << supersampleExponent,   CT2 = Renderer.getTempCT(0, this.Dim.x * fac, this.Dim.y * fac);
      CT2.globalCompositeOperation = 'source-over';     // CT2.setTransform(1, 0, 0, 1, 0, 0);
      this.paint(CT2);
      CT2.globalCompositeOperation = 'copy';
      while(supersampleExponent-- > 1)     CT2.drawImage(CT2.canvas, 0, 0, this.Dim.x *  fac,        this.Dim.y * fac,
                                                                     0, 0, this.Dim.x * (fac >>= 1), this.Dim.y * fac);
      Spr.CT.drawImage(CT2.canvas, 0, 0, this.Dim.x * 2, this.Dim.y * 2,   0, 0, this.Dim.x, this.Dim.y);
    }
    return Spr;
  },
  derive: function(extraParam) {
    var This = this;
    if(!this.hasOwnProperty('childConstructor'))   (this['childConstructor'] = function() { this.parent = This; }).prototype = this;
    var E = new this.childConstructor(); // does nothing except setting the parent reference
    if(!extraParam)   return E;
    for(var attr in extraParam)     if(attr === 'path')   E['path'] = extraParam.path.replace(/%path\b/g, this.path);
                                    else                  E[attr]   = extraParam[attr];
    return E;
  },
  paint: function(CT, x, y) { // Does NOT call init() !
    var This = this, pa = this.path.replace(pathPat, function(s) { return (s.substring(0, 1) === '%' ? This[s.substring(1)] : s); });
    CT.save();
    CT.translate(x || 0, y || 0);
    CT.scale(this.scale, this.scale);
    CT.beginPath();
    mScore.drawSpritePath.call(CT, pa, this);
    CT.restore();
    CT.fill();
  },
  parentPath: function() { var This = this;
                           return this.parent.path.replace(pathPat, function(s) { return (s.substring(0, 1) === '%' ? This[s.substring(1)] : s); });   }
};
})();


(function() { // call on a 2D canvas context
              // *SD* is a sprite description object holding the parameters referenced by *Str* (e.g. in $...$); may be omitted if there are none.
mScore['drawSpritePath'] = function(Str, SD) {
  var s, t, nOpArg, curOp, i, i2 = 0, L = Str.match(splitter), L2, j, je, P = [ ];
  var val = mScore.Renderer.SpriteDescriptionFunctions.val;
  this.save();
  for(i = 0;     i < L.length || L2;) {
    // extract one path item (number, operator, evaluator)
    if(L2)      { P[i2++] = ((t = oplist[(s = L2[j++])]) === undefined ? +s : s);     if(j >= L2.length)   L2 = undefined; }
    else switch((s = L[i++]).substring(0, 1)) {
      case '$':   t = undefined;     P[i2++] = val.call(SD, s.substring(1, s.length - 1));                               break; // current local coordinates
      case '@':   t = undefined;     P[i2++] = val.call(SD, s.substring(1, s.length - 1)) / SD.scale;                    break; // pixel coordinates
      case '!':   t = undefined;     P[i2++] = val.call(SD, s.substring(1, s.length - 1)) / SD.scale * SD.lineWidth;     break; // line width coordinates
      case 'D':   L2 = s.substr(2).match(new RegExp(oplist2 + '|\\-?\\d{'      + s.substr(1, 1) + '}', 'g'));
                  j = 0;     continue;
      case 'X':   L2 = s.substr(2).match(new RegExp(oplist2 + '|\\-?[\\da-f]{' + s.substr(1, 1) + '}', 'g'));
                  for(j = 0, je = L2.length;     j < je;     ++j)     if(oplist[L2[j]] === undefined)   L2[j] = parseInt(L2[j], 16);
                  j = 0;     continue;
      default:    P[i2++] = ((t = oplist[s]) === undefined ? +s : s);
    }
    if(t !== undefined)   { nOpArg = t;     curOp = P[(i2 = 0)]; } // operator switch, we already know how many arguments it takes
    if(i2 < nOpArg)   continue; // iterate until we have extracted enough arguments for the current operator
    switch(curOp) {
      case 'Trs':   this.translate       (P[0], P[1]);                                                                       break;
      case 'Sc' :   this.scale           (P[0], P[1]);                                                                       break;
      case 'Tfl':   this.transform       (P[0], P[1],     P[2], P[3],     0, 0);                                             break;
      case 'M'  :   this.moveTo          (P[0], P[1]);                                                                       break;
      case 'C'  :   this.bezierCurveTo   (P[0], P[1],     P[2], P[3],     P[4], P[5]);                                       break;
      case 'Q'  :   this.quadraticCurveTo(P[0], P[1],     P[2], P[3]);                                                       break;
      case 'L'  :   this.lineTo          (P[0], P[1]);                                                                       break;
      case 'Ap' :   this.arc             (P[0], P[1], P[2],   P[3] * Math.PI/180, P[4] * Math.PI/180, true);                 break;
      case 'An' :   this.arc             (P[0], P[1], P[2],   P[3] * Math.PI/180, P[4] * Math.PI/180, false);                break;
      case 'Z'  :   this.closePath       ();                                                                                 break;
      case 'Rct':   this.rect            (P[0], P[1], P[2], P[3]);                                                           break;
      case 'Af' :   this.moveTo(P[0] + P[2], P[1]);     this.arc(P[0], P[1], P[2], 0, 2*Math.PI);     this.closePath();      break;
      case 'Trp':   this.restore();     this.save();     this.translate(SD.Pvt.x / SD.scale, SD.Pvt.y / SD.scale);           break;
      case 'Trc':   this.restore();     this.save();     this.translate(SD.Crn.x / SD.scale, SD.Crn.y / SD.scale);           break;
      case 'Str':   this.restore();     this.save();     this.lineWidth = P[0];     this.stroke();     this.beginPath();     break;
      case 'Rst':   this.restore();     this.save();                                                                         break;
    }
    i2 = 0;
  }
  this.restore();
};
  var oplist   = { M:2, C:6, Q:4, L:2, Ap: 5, An: 5, Af:3, Tfl: 4, Rst:0, Trc: 0, Trp:0, Trs:2, Sc:2, Str:1, Rct:4, Z:0 },   oplist2 = [ ];
  for(var I in oplist)   oplist2.push(I);     oplist2 = oplist2.join('|');
  var splitter = new RegExp(oplist2 + '|\\$[^\\$]*\\$|@[^@]*@|![^!]*!|[XD]\\d[^XDA\\s@\\$!]*|[+-]?[\\d.]+', 'g');
})();

/**************************************************************************************************************************************************************/

mScore.Renderer['Sprite'] = function(Renderer, name, Dim, ReferencePointToOrigin) {
  this.CT       = mScore.Renderer.create2dContext(Dim.x, Dim.y);
  this.CA       = this.CT.canvas;
  this.Ref      = ReferencePointToOrigin; // no copying
  this.name     = name;
  //this.Renderer = Renderer;
};

mScore.Renderer.Sprite.prototype = {
  CTColor:      document.createElement('CANVAS').getContext('2d'),
  toString:     function() { return '[Sprite ' + this.name + ']'; },
  boxDistance:  function(x, y)  { return Math.max((x = 2 * (this.Ref.x - x) / this.CA.width  + 1) * x,
                                  (y = 2 * (this.Ref.y - y) / this.CA.height + 1) * y);                  },
  draw:         function(CT, x, y, color) {
    if(color === undefined || color === '#000000')
      { CT.drawImage(this.CA, x + this.Ref.x, y + this.Ref.y);     return; }
    var CCT = this.CTColor, CA = CCT.canvas, SCA = this.CA;
    if(CA.width  < SCA.width )   CA.width  = SCA.width;
    if(CA.height < SCA.height)   CA.height = SCA.height;
    CCT.fillStyle = color;
    CCT.fillRect(0, 0, SCA.width, SCA.height);
    CCT.globalCompositeOperation = 'destination-in';
    CCT.drawImage(SCA, 0, 0);
    CCT.globalCompositeOperation = 'source-over'; // back to default
    CT.drawImage(CA, 0,              0,              SCA.width, SCA.height,
                     x + this.Ref.x, y + this.Ref.y, SCA.width, SCA.height);
  },
  drawClear:    function(CT, x, y)  { CT.clearRect(x + this.Ref.x, y + this.Ref.y, this.CA.width, this.CA.height);
                                      CT.drawImage(this.CA, x + this.Ref.x, y + this.Ref.y);                         },
  drawBG:       function(CT, x, y, BGcolor) { CT.fillStyle = BGcolor;     CT.fillRect(x + this.Ref.x, y + this.Ref.y, this.CA.width, this.CA.height);
                                              CT.drawImage(this.CA, x + this.Ref.x, y + this.Ref.y);                                                    },
  drawCropY:    function(CT, x, y, height, color) {
    var SCA = this.CA;
    if(color === undefined || color === '#000000')
      { CT.drawImage(SCA, 0, 0, SCA.width, (height < SCA.height ? height : SCA.height),   x + this.Ref.x, y, SCA.width, height);     return; }
    var CCT = this.CTColor, CA = CCT.canvas;
    if(CA.width  < SCA.width )   CA.width  = SCA.width;
    if(CA.height < SCA.height)   CA.height = SCA.height;
    CCT.fillStyle = color;
    CCT.fillRect(0, 0, SCA.width, height);
    CCT.globalCompositeOperation = 'destination-in';
    CCT.drawImage(SCA, 0, 0, SCA.width, (height < SCA.height ? height : SCA.height),
                       0, 0, SCA.width, height);
    CCT.globalCompositeOperation = 'source-over'; // back to default
    CT.drawImage(CA, 0,              0, SCA.width, height,
                     x + this.Ref.x, y, SCA.width, height);
  }
};

mScore.Renderer.prototype['createDigitSprite'] = function(digit, size) { // size as multiples of line width
  var D = this.DigitSprites[digit], d;
  if((d = D[size]))     return d; // cached version
  (D[size] = (d = this.Const.Digit['d' + digit]).createSprite('' + digit, this, size))['internalWidth'] = d.toR * size * this.line;
  return D[size];
};

/**************************************************************************************************************************************************************/
/**                                                                  Methods for drawing stuff                                                               **/
/**************************************************************************************************************************************************************/

mScore.Renderer.prototype['drawSingleChord'] = function(CT, Chord, dx, dy) {
  if(Chord.merge) {
    if(Chord !== Chord.merge.MasterVoice) return; // not the master chord --> avoid multiple drawing
    Chord = Chord.merge; // replace chord with the merged chord
  }
  if(Chord.shiftAmount)  dx += (Chord.stemUp ? 1 : -1) * this.Spaces.chordShift * Chord.shiftAmount;
  var stemlen = (Chord.stemUp ? this.Spaces.stemLength : -this.Spaces.stemLength);
  if(Chord.shiftVertical)   stemlen += Math.round(this.Const.lineWidth * Chord.shiftVertical);
  this.drawChordFlagless(CT, Chord, dx, dy, stemlen, false);
  if(Chord.value.nBeams > 0)
    this.Sprites['L' + Chord.value.val + (Chord.stemUp ? 'U' : 'D')].draw(CT, Chord.x + dx, Chord.y1 - stemlen + dy, Chord.ColorStyle&&Chord.ColorStyle.Color);
};


mScore.Renderer.prototype['drawChordFlagless'] = function(CT, Ch, dx, dy, stemEnd, stemAbsolute) {
  var P = Ch.P, n = P.length - 1, y0 = P[Ch.stemUp ? 0 : n].y,   y2,   S = this.Sprites,   Q,   len,   i, p, t, color;
  dx += Ch.x; // x position of the reference point of the chord
  // draw ledger lines above and below as needed
  for(y2 = 5 * this.line + Ch.Stave.Stave.y, Q = S.StL;     y2 < y0 + this.halfLine;     y2 += this.line)
    CT.drawImage(Q.CA, Q.Ref.x + dx, y2 + Q.Ref.y + dy);
  y0 = P[Ch.stemUp ? n : 0].y; // the highest note
  for(y2 = -this.line + Ch.Stave.Stave.y;   y2 >= y0;   y2 -= this.line)     CT.drawImage(Q.CA, Q.Ref.x + dx, y2 + Q.Ref.y + dy);
  Q = Ch.nDots && (Ch.nDots === 1 && !Ch.isFull ? S.D1 : this.Sprites2[(Ch.isFull ? 'DF' : 'D') + Ch.nDots]);
  for(i = 0, t = Ch.value.head + (Ch.stemUp ? 'U' : 'D');     i <= n;     ++i, t = Ch.value.head) {
    p = P[i];     color = (p.ColorStyle || Ch.ColorStyle).Color;
    S[t + (p.noteOut || '')].draw(CT, dx, p.y + dy, color);
    if(p.acc !== undefined)     S['A' + p.acc].draw(CT,   dx + p.xAcc,     p.y     + dy,   color);
    if(Q)                       Q             .draw(CT,   dx + Ch.xDots,   p.yDots + dy,   color);
  }
  if(Ch.value.name !== 'whole') {
    if(stemAbsolute)   stemEnd += dy;
    dy += P[0].y + (Q = Ch.stemUp ? S.SU : S.SD).Ref.y;
    if(stemAbsolute)   len     = dy - stemEnd;
    else               stemEnd = dy - (len = stemEnd + (P[0].y - Ch.y1));
    if(!Ch.stemUp)   stemEnd -= (len = -len);
    if(len > 0)   Q.drawCropY(CT, dx, stemEnd, len, Ch.ColorStyle.Color); // draw note stem
  }
};


mScore.Renderer.prototype['drawBeamedGroup'] = function(CT, BG, dx, dy) {
  var fac = 1 << this.Const.Beam.supersamplingExponent, // vertical supersampling of the beam to allow higher precision
      Ch = BG.Ch, T, T2, p, p1, i = 0, ie = Ch.length - 1, t, s0, s1, hBeam, yBeam, B = BG.beam, X = new Array(Ch.length);
  for(t = this.Spaces.chordShift;     i <= ie;     ++i) // left edges of note stems
    X[i] = (p = Ch[i]).x + t * (p.shiftAmount || 0) + this.Stm[p.stemUp].Ref.x;
  var wBeam    = X[ie] + this.Stm[Ch[ie].stemUp].CA.width - X[0],                     // width of the beam subcanvas
      stemstub = Math.ceil(Math.abs(this.maxStmWidth * B.x)) + 1,                     // exact value is not very important, just can't be too small
      Bwth     = Math.round(fac *  this.Const.Beam.width * (t = this.line * B.lam)),  // vertical thickness of a single beam
      Bsep     = Math.round(fac * (this.Const.Beam.width + this.Const.Beam.sep) * t), // vertical beam step
      Bhgt     = Bsep * (BG.nMaxBeams - 1) + Bwth;                                    // vertical thickness of the whole beam bundle

  // draw beam structure (horizontal) in beam subcanvas; all y coordinates are integers, which will later be downsampled
  hBeam = -((-Bhgt) & ~(fac-1)); // *Bhgt* rounded up to next multiple of *fac*; gratuitious cleverness
  hBeam += (t = 2 * fac * stemstub) + (yBeam = BG.twoSided ? t : 0);
  for(i = 0, T = this.getTempCT(0, wBeam, hBeam);     i <= ie;     ++i) // draw stem stubs into beam subcanvas
    if((t = Ch[i].stemUp) === BG.stemUp)
           T.drawImage((p1 = this.Stm[t]).CA,     0, 0, p1.CA.width, Math.min(hBeam, (s1 = hBeam - yBeam)),     X[i] - X[0], yBeam, p1.CA.width, s1);
    else { s1 = yBeam + Bsep * (Ch[i].value.nBeams - 1) + Bwth;
           T.drawImage((p1 = this.Stm[t]).CA,     0, 0, p1.CA.width, Math.min(hBeam, s1),                       X[i] - X[0], 0,     p1.CA.width, s1);   }
  for((i = 0, t = yBeam), B = BG.beamPattern;     i < B.length;     ++i) // draw beams
    { if(B[i] === true)   { t += Bsep;     continue; }
      s0 = ((p = B[  i]) === null ? Ch[B[i + 1]].xS - this.Spaces.stubR : Ch[p].xS);
      s1 = ((p = B[++i]) === null ? Ch[B[i - 1]].xS + this.Spaces.stubL : Ch[p].xS);
      T.fillRect(s0 - X[0], t, s1 - s0, Bwth);                                         }

  // vertical downsampling
  Bhgt /= fac;     yBeam /= fac;     T.globalCompositeOperation = 'copy';
  while((fac >>= 1))   T.drawImage(T.canvas, 0, 0, wBeam,   hBeam, 0, 0, wBeam, hBeam /= 2); // downsampling
  T.globalCompositeOperation = 'source-over'; // because of how we set up the canvas, *hBeam* and *yBeam* after downsampling are still integers

  // draw the transformed (slanted) beam bundle in a small temporary canvas
  // We need this intermediate step before final drawing because we need to cut off the slanted ends of the stem stubs with *clearRect*.
  p = s0 = s1 = (B = BG.beam).x * X[0] + B.y; // vertical position of beam measured at the left edge of the subcanvas
  if(B.x >= 0)     s1 += B.x * wBeam;     else     s0 += B.x * wBeam;
  if(BG.stemUp)   { s0 -= yBeam;     s1 += hBeam - yBeam; }     else     { s1 += yBeam;     s0 -= hBeam - yBeam; }
  s0 = Math.floor(s0);     s1 = Math.ceil(s1);
  (T2 = this.getTempCT(1, wBeam, (s1 -= s0))).setTransform(1, B.x, 0, (t = BG.stemUp ? 1 : -1), 0, p - t * yBeam - s0);
  T2.drawImage(T.canvas,     0, 0, wBeam, hBeam,     0, 0, wBeam, hBeam);     T2.setTransform(1, 0, 0, 1, 0, 0);

  // coloring stuff if required
  for(t = (p = Ch[0].ColorStyle).isDefault ? 0 : 1, i = 1;     i <= ie;     ++i, p = p1)
    if(p !== (p1 = Ch[i].ColorStyle) && p.Color !== p1.isColor)   t = 2;
  if(t > 0) {
    T = this.getTempCT(0, wBeam, s1); // re-fetch the first temporary canvas with different height, just in case
    if(t === 1)   T.fillStyle = Ch[0].ColorStyle.Color; // don't use a gradient if not necessary
    else {
      var G = T.createLinearGradient(0, 0, wBeam, 0);
      B = [ -X[0] + this.Const.Beam.ownColorWidth / 2,   -X[0] - this.Const.Beam.ownColorWidth / 2 ];
      for(i = 1, p = Ch[0].ColorStyle;     i <= ie;     ++i, p = p1)
        if(p.Color !== (p1 = Ch[i].ColorStyle).isColor)   { G.addColorStop((Ch[i - 1].xS + B[0]) / wBeam, p .Color);
                                                            G.addColorStop((Ch[i]    .xS + B[1]) / wBeam, p1.Color); }
      T.fillStyle = G;
    }
    T.fillRect(0, 0, wBeam, s1);
    T.fillStyle = '#000000';     T.globalCompositeOperation = 'destination-in';
    T.drawImage(T2.canvas,     0, 0, wBeam, s1,     0, 0, wBeam, s1);
    (T2 = T).globalCompositeOperation = 'source-over';     B = BG.beam;
  }

  // cur note stem stub, draw rest of the notes, put in the finished beam
  for(i = 0, p2 = 0, hBeam = this.Spaces.chordShift;     i <= ie;     ++i) {
    if(Ch[i].stemUp)   { t = B.x * Ch[i].xS + B.y + stemstub;     if( BG.stemUp)   t += Bhgt;     p = 0; }
    else               { t = B.x * Ch[i].xS + B.y - stemstub;     if(!BG.stemUp)   t -= Bhgt;     p = stemstub + 1; }
    T2.clearRect(X[i] - X[0], (t = Math.round(t)) - p - s0, this.maxStmWidth, stemstub + 1);
    this.drawChordFlagless(CT, Ch[i], dx + hBeam * (Ch[i].shiftAmount || 0), dy, t, true);
  }
  CT.drawImage(T2.canvas,     0, 0, wBeam, s1,     dx + X[0], dy + s0, wBeam, s1);
};


mScore.Renderer.prototype['drawSingleStave'] = function(CT, dx, dy, width) {
  // Is this faster than one *drawImage* call with horizontal scaling?
  var x = 0, Q = this.Sprites.St;
  while(x + Q.CA.width < width)   { CT.drawImage(Q.CA, dx + x, dy + Q.Ref.y);     x += Q.CA.width; }
  CT.drawImage(Q.CA, 0, 0, width - x, Q.CA.height, dx + x, dy + Q.Ref.y, width - x, Q.CA.height);
};


mScore.Renderer.prototype['drawBarLine'] = function(CT, Piece, x, y, type, linePos) {
  var Q, x1, i, I = Piece.Staves, w, h, y0 = 0, t, z;
  linePos = (linePos || 0);     type = 'BL' + (type || '1');
  if(linePos === 2)   type += '_el';
  if(I.length > 1)    type += 'L';
  x1 = x + (Q = this.Sprites[type]).totalWidth;     w = Q.CA.width;
  if(linePos === 2)   CT.clearRect(x + Q.Ref.x, y + Q.Ref.y, Q.CA.width, I[I.length - 1].y + Q.y0);
  if((t = Q.Dots))   for(i = 0;     i < I.length;     ++i)     CT.drawImage(t.CA, x + t.Ref.x, y + I[i].y + t.Ref.y);
  x += Q.Ref.x;     y += Q.Ref.y;
  switch(I.length) {
    case 1:    CT.drawImage(Q.CA, x, y);     break;
    case 2:    CT.drawImage(Q.CA,     0, 0, w, Q.y0,     x, y, w, Q.y0);
               h = Math.min(Q.CA.height - Q.y1, (z = I[1].y));     y += Q.y0;     z -= h;
               if(z > 0)   CT.drawImage(Q.CA,     0, Q.y1, w, Math.min(z, Q.y2 - Q.y1),     x, y, w, z);
               CT.drawImage(Q.CA,     0, Q.CA.height - h, w, h,     x, y + z, w, h);                         break;
    default:   CT.drawImage(Q.CA,     0, 0, w, this.line,     x, y, w, this.line);
               for(i = 1, t = this.line;     i < I.length;     ++i, (t = 0)) {
                 h = Math.min(Q.y2 - this.line, (z = I[i].y - y0));
                 CT.drawImage(Q.CA,     0, this.line + t, w, h - t,     x, y + t, w, h - t);
                 if(h < z)   CT.drawImage(Q.CA,     0, Q.y1, w, Math.min(z - h, Q.y2 - Q.y1),     x, y + h, w, z - h);
                 y += z;     y0 = I[i].y;
               }
               CT.drawImage(Q.CA,     0, Q.y2, w, Q.CA.height - Q.y2,     x, y, w, Q.CA.height - Q.y2);
  }
  return x1;
};


mScore.Renderer.prototype['keyWidth'] = function(keyArray) {
  var w = 0, k, S = this.Sprites, i = 0, ie = keyArray.length;
  if(typeof keyArray[0] === 'number') {
    while(i < ie)
      if((k = keyArray[i++]) !== undefined &&
         (k = (k === 0 ? S.A0.CA.width : Math.abs(k) * S['A' + (k >= 0 ? '1' : '-1')].CA.width)) > w)     w = k;
  } else {
    while(i < ie)
      if((k = keyArray[i++].key) !== undefined &&
         (k = (k === 0 ? S.A0.CA.width : Math.abs(k) * S['A' + (k >= 0 ? '1' : '-1')].CA.width)) > w)     w = k;
  }
  return w && (w + this.Spaces.beforeKey);
};


mScore.Renderer.prototype['drawKey'] = function(CT, Staves, x, y, keyOverride) {
  var w = 0, k, S = this.Sprites, St, j, magic, y1, Q;
  for(var i = 0, ie = Staves.length;     i < ie;     ++i) {
    St = Staves[i];
    if((k = (keyOverride ? keyOverride[i] : St.key)) === undefined)   continue; // implicit C major key --> nothing to draw
    if(k === 0) {
      CT.drawImage((Q = S.A0).CA, x + this.Spaces.beforeKey, y + St.y + Q.Ref.y + mScore.magicNumbers[St.clef][1] * this.halfLine);
      if(w < Q.CA.width)     w = Q.CA.width;
      continue;
    }
    Q = S['A' + (magic = (k > 0 ? 1 : -1))];
    y1 = y + St.y + Q.Ref.y +  mScore.magicNumbers[St.clef][(3 - magic) >> 1] * this.halfLine; // y = 1 --> magicNumber[1],   y = -1 --> magicNumber[2]
    for(k *= magic, j = 0;      j < k;     ++j) {
      CT.drawImage(Q.CA, x + this.Spaces.beforeKey + j * Q.CA.width, y1);
      y1 += magic * (3 - 7 * (j & 0x01)) * this.halfLine;
    }
    if(w < k * Q.CA.width)     w = k * Q.CA.width;
  }
  return x + (w && (w + this.Spaces.beforeKey));
};


mScore.Renderer.prototype['drawClefs'] = function(CT, StaveClefs, x, y) {
  var w = 0, St, Q;
  for(var i = 0, ie = StaveClefs.length;     i < ie;     ++i) {
    Q = this.Sprites['C' + (St = StaveClefs[i]).clef];
    if(CT)     CT.drawImage(Q.CA, x + this.Spaces.beforeClef, y + St.Stave.y + Q.Ref.y);
    if(w < Q.CA.width)     w = Q.CA.width;
  }
  return x + (w && (w + this.Spaces.beforeClef));
};


// default hAlign: left;     default vAlign: top,      *size* = multiples of line width
mScore.Renderer.prototype['drawNumber'] = function(CT, x, y, number, size, hAlign, vAlign, xSpan) {
  var d, i, width = 0, di;
  if(typeof number === 'number') {
    d = [ ];
    do d.push(number % 10); while((number = Math.floor(number / 10)) !== 0); // extract digits from number
  } else { // string, containing digits and periods
    d = number.split('');
    for(i = 0;     i < d.length;     ++i)   d[i] = ((di = d[i]) === '.' ? 10 : +di);
    d.reverse();
  }
  for(i = 0;     i < d.length;     ++i)     width += (d[i] = this.createDigitSprite(d[i], size)).CA.width;
  if(!CT)   return width;
  switch(hAlign)   { case 'right' :   x -=  width;                         break;
                     case 'center':   x -= (width >>> 1);                  break;   }
  switch(vAlign)   { case 'top'   :   y +=   size * this.line;             break;
                     case 'middle':   y += ((size * this.line) >>> 1);     break;   }
  if(xSpan)   xSpan[0] = x + d[i - 1].Ref.x; // as it is now, the left sides of digits are at pixel boundaries
  while(i-- !== 0)   { CT.drawImage((di = d[i]).CA, x + di.Ref.x, y + di.Ref.y);     x += di.CA.width; }
  if(xSpan)   xSpan[1] = x - di.CA.width + di.internalWidth; // the right sides aren't, though
  return width;
};


mScore.Renderer.prototype['drawTupletBracket'] = function(CT, dx, dy, Tuplet) {
  var B = Tuplet.beam, It = Tuplet.It, ie = It.length - 1,  T = this.Const.Tuplet, xSpan = [ 0, 0 ], s = (Tuplet.stemUp ? 1 : -1),
      x0 = It[0].xS,   x1 = It[ie].xS,   x = (x0 + x1) / 2,   t = s * this.line * T.aroundNumberSpace.y;
  this.drawNumber(CT, dx + (x = Math.round(x + t * B.x)), Math.round(dy + (B.x * x + B.y) - t),
                  Tuplet.Tuplet.splitNumber, T.fontSize, 'center', Tuplet.stemUp ? 'bottom' : 'top', xSpan);
  xSpan[0] -= dx + T.aroundNumberSpace.x * this.line;     xSpan[1] -= dx - T.aroundNumberSpace.x * this.line;
  if(Tuplet.Tuplet.style !== 'a' || !Tuplet.BG) {
    x0 -= this.line * T.bracketSpace.x;   x1 += this.line * T.bracketSpace.x;     dy += B.y - this.line * s * T.bracketSpace.y * B.lam;
    CT.beginPath();     CT.moveTo(dx + x0, (y = dy + x0 * B.x) + s * T.stubHeight * this.line);     CT.lineTo(dx + x0, y);
    CT.lineTo(dx + xSpan[0], dy + xSpan[0] * B.x);
    CT.moveTo(dx + xSpan[1], dy + xSpan[1] * B.x);
    CT.lineTo(dx + x1, (y = dy + x1 * B.x));     CT.lineTo(dx + x1, y + s * T.stubHeight * this.line);
    CT.lineWidth = this.r2l;     CT.strokeStyle = 'Black';     CT.stroke();
  }
};


// *Bar1* is the bar AFTER the repeat bracket
mScore.Renderer.prototype['twoPartRepeat'] = function(CT, dx, dy, Bar0, Bar1, endingIdx) {
  dy += this.Const.Stave.cen0 + Bar0.twoEndings.dy;
  var S = this.Spaces,   Q = this.Sprites['BL' + Bar0.style],   x = dx + Bar0.x,   y = dy - S.twoEndingHookHeight,   B;
  if(Bar0.idx !== Bar0.Line.beginBar)   x = dx + (B = Bar0.Piece.Bars[Bar0.idx - 1]).x + B.width + Q.x1;
  this.drawNumber(CT, Math.round(x) + S.twoEndingNumberOffs.x,
                      Math.round(y) + S.twoEndingNumberOffs.y,   endingIdx + '.',   this.Const.twoEndingFontSize,     'top', 'left');
  CT.beginPath();     CT.moveTo(x, dy);     CT.lineTo(x, y);
  x = dx + (B = Bar1.Piece.Bars[Bar1.idx - 1]).x + B.width + this.Sprites['BL' + Bar1.style].x0;
  CT.lineTo(x, y);     CT.lineTo(x, dy);     CT.lineWidth = this.r2;     CT.lineJoin = 'miter';     CT.stroke();
};


mScore.Renderer.prototype['drawTimeSignature'] = function(CT, Staves, x, y, TimeSignature) {
  for(var i = 0, ie = Staves.length, n, d;     i < ie;     ++i) {
    n = this.drawNumber(CT, x + TimeSignature.xNum, y + Staves[i].y +     this.line, TimeSignature.num, this.Const.timeFontSize, 'left', 'middle');
    d = this.drawNumber(CT, x + TimeSignature.xDen, y + Staves[i].y + 3 * this.line, TimeSignature.den, this.Const.timeFontSize, 'left', 'middle');
  }
  if(CT)     return x + Math.max(n, d);
  // otherwise just measure stuff and set values
  if(n >= d)   { TimeSignature.xNum = 0;                   TimeSignature.xDen = ((n - d) >>> 1); }
  else         { TimeSignature.xNum = ((d - n) >>> 1);     TimeSignature.xDen = 0;               }
  return x + Math.max(n, d);
};


// *tieOut*: true <==> *C* is tie start,   false <==> *C* is tie end
/** Ties going into *C* (i.e. if *tieOut* == false) are only drawn if
      *) They originate in a previous line ——> draw them from the beginning of *C*'s line to *C0*
      *) *croppedSingle* is set and the the tie originates in a previous bar                                 */
mScore.Renderer.prototype['drawTie'] = function(CT, dx, dy, C, tieOut, Line, croppedSingle) {
  var i, ie, cutoffType, xCut, w = 0, B0, B1, p0, p1, C0, C1, field = (tieOut ? 'tieTo' : 'tieFrom'), Pos0, Pos1, j, je;
  /*if(typeof C1 === 'number')   return; // TODO!!
  if(typeof C0 === 'number')   return; //*/
  CT.beginPath();
  for(i = 0, ie = C.P.length;     i < ie;     ++i) {
    if(!(p0 = C.P[i])[field])   continue;
    if(tieOut)   { C0 = C;     C1 = p0.tieToChord;     p1 = p0.tieTo; }
    else {
      C1 = C;     C0 = p0.tieFromChord;     p0 = (p1 = p0).tieFrom;
      if(C0.Bar.Line === Line && !(croppedSingle && C0.Bar !== C1.Bar))   continue;
    }
    if(!p0.tieDirection)   continue; // invisible tie (yeah, some people use this. Probably shouldn't)
    // i.e. the tie is from the note *p0* to *p1* which are contained in the chords *C0* and *C1*
    if((B0 = C0.Bar).Line !== (B1 = C1.Bar).Line) {
      w = B0.Line.lineWidth - (B0.x + C0.x) + (B1.x + C1.x);
      for(j = B0.Line.idx, je = B1.Line.idx - 1;     j < je;     ++j)     w += Line.Piece.Lines[j].lineWidth;
      cutoffType = (B0.Line === Line ? 'b' : (B1.Line === Line ? 'e' : 'm'));
    } else w = 0;
    Pos0 = this.TieEnd['Q'][p0.tiePointOut].cp();
    Pos1 = this.TieEnd['Q'][p1.tiePointIn] .cp(); // TODO!! Replace "Q"
    w -= Pos0.x + Pos1.x;
    Pos0.Add(B0.x + C0.x, p0.y);
    Pos1.Add(B1.x + C1.x, p1.y);
    switch(cutoffType) {
      case 'b':
        xCut = B0.x + B0.width - 2;
        Pos1.Set(xCut, Pos0.y + (Pos1.y - Pos0.y) * (xCut - Pos0.x) / w);     break;
      case 'e':
        xCut = B1.x + 2;
        Pos0.Set(xCut, Pos1.y + (Pos1.y - Pos0.y) * (xCut - Pos1.x) / w);     break;
      case 'm': break; // TODO
    }
    this.drawTieCurve(CT, dx + Pos0.x,   dy + Pos0.y,
                          dx + Pos1.x,   dy + Pos1.y,   3,   p0.tieDirection === 'u');
  }
  CT.fill();
};


// assuming x0 < x1
mScore.Renderer.prototype['drawTieCurve'] = function(CT, x0, y0, x1, y1, h, upwards) {
  var lambda = .5, dh = 1, dw = .2;
  var X = new mScore.P2d(.5 * (x1 - x0), .5 * (y1 - y0)).Mul(.5 * (1 - lambda - dw)), Y = X.cp().Mul(4/3 * (h + dh) * (upwards ? -1 : 1) / X.norm());
  CT.moveTo(x0, y0);
  CT.bezierCurveTo(x0 + X.x - Y.y, y0 + X.y + Y.x,     x1 - X.x - Y.y, y1 - X.y + Y.x,     x1, y1);
  Y.Mul((h - dh) / (h + dh));     X.Mul((1 - lambda + dw) / (1 - lambda - dw));
  CT.bezierCurveTo(x1 - (h = 1 - lambda + dw) * X.x - Y.y, y1 - h * X.y + Y.x,     x0 + h * X.x - Y.y, y0 + h * X.y + Y.x,     x0, y0);
};

/**************************************************************************************************************************************************************/
/**                                                                    "Static" methods                                                                      **/
/**************************************************************************************************************************************************************/

mScore.Renderer['create2dContext'] = function(width, height) {
  var Ca = document.createElement('CANVAS');
  Ca.width = width;     Ca.height = height;
  return Ca.getContext('2d');
};


mScore.Renderer.prototype['getTempCT'] = function(idx, minW, minH) {
  if(this.CTtemps.length <= idx || !this.CTtemps[idx])   return this.CTtemps[idx] = mScore.Renderer.create2dContext(minW, minH);
  var CT = this.CTtemps[idx], ca = CT.canvas;
  if(ca.width >= minW)
    if(ca.height >= minH)   { CT.clearRect(0, 0, ca.width, ca.height);     return CT; }
    else                    ca.height = minH;
  else { ca.width = minW;     if(ca.height < minH)   ca.height = minH; }
  return CT;
};

/**************************************************************************************************************************************************************/
/**                                                              The big initialization method                                                               **/
/**************************************************************************************************************************************************************/

mScore.Renderer.prototype['initialize'] = function() {
  var C = this.Const,   S = this.Sprites,   Sp = this.Spaces,   t, i; // for more compact notation
  for(var key in Sp)     if((t = Sp[key]) !== undefined)
    if(t instanceof mScore.P2d)     t.Mul(C.lineWidth).Map(Math.round);
    else                            Sp[key] = Math.round(t * C.lineWidth);
  this['line']     = C.lineWidth;     // needed very frequently, so here's convenience shortcuts without *Const*
  this['halfLine'] = C.lineWidth / 2; //
  this['r2']       = 2 * C.r;     this['r2l'] = 2 * C.r * C.lineWidth;
  C.Beam.ownColorWidth *= C.lineWidth; // not in *Spaces*, because it can be non-integer

  var This = this;    // for closure-use
  var createSprite = function(name, Obj, mode) { return (This.Sprites[name] = Obj.createSprite(name, This, undefined, mode)); };

  createSprite('St',  C.Stave);
  createSprite('StL', C.Ledger);
  [ ['1', 'Single', -1,0,1],   ['2', 'Double', 0,1],   ['3',  'Triple',   0,1],
    ['b', 'Begin',  -1,0],     ['e', 'End',    0,1],   ['eb', 'EndBegin', 0] ].forEach(function(X) {
    var q = C.Stave.Barline[X[1]], s = 'BL' + X[0], i = 1, suffix = { '-1': '_bl',   '0': '',   '1': '_el' }, Dots, Q, Q2, param, s1;
    if((Dots = q.dotsLeft || q.dotsRight))   Dots = createSprite('BLD' + X[0], q.Dots);
    while(++i < X.length)   { s1 = s + suffix[X[i]];
                              (Q  = createSprite(s1,       q, (param = { linePos: X[i] })))    ['Dots'] = Dots;
                              (Q2 = createSprite(s1 + 'L', q, ((param['long'] = true), param)))['Dots'] = Dots;
                              Q2['totalWidth'] = Q['totalWidth'] = (q.dotsRight ? q.Dots.Ref.x + q.Dots.Dim.x : q.Ref.x + q.Dim.x);
                              Q2['x0'] = Q['x0'] = q.x0;     Q2['x1'] = Q['x1'] = q.x1;
                              Q2['y0'] = Q['y0'] = Q.CA.height;     Q2['y1'] = Q2.y0 + This.line;     Q2['y2'] = Q2.CA.height - Q.CA.height;   }
  });
  this['staveOffs'] = S.BLe_elL.y1 - this.line;

  createSprite('CG', C.Clef.G);     createSprite('CF', C.Clef.F);

  var List = { '':{up:undefined,shiftOut:0}, R:{up:true,shiftOut:1}, U:{up:true,shiftOut:0}, D:{up:false,shiftOut:0}, L:{up:false,shiftOut:-1} },
      holdsTieEnds = { 'F': true, 'FR': true, 'Q': true, 'QL': true, 'QR': true };
  [ [C.Note.Full, 'F','','R'], [C.Note.Half, 'H','L','D','','U','R'], [C.Note.Quarter, 'Q','L','D','','U','R'] ].forEach(function(X) {
    for(var i = 2, x, TE;     i < X.length;     ++i) {
      var N = createSprite((x = X[1] + X[i]), X[0], List[X[i]]);
      if(!holdsTieEnds[x])   continue;
      TE = This.TieEnd[x] = new Array(9); // a tie can link to a note head in 9 different places — note center and 8 slanted octants around
      TE[0] = N.Ref.cp().Add((x = X[0]).Pvt);
      var fac = 1.3 * This.line,   q = Math.sqrt(1 - (x = x.R).lam * x.lam);
      for(var j = 0;     j < 8;     ++j)
        TE[j + 1] = TE[0].cp().Add( fac * x.x * (q * Math.cos(Math.PI / 4 * j) + x.lam * Math.sin(Math.PI / 4 * j)),
                                   -fac * x.y *                                          Math.sin(Math.PI / 4 * j));
    }
  });
  S['FU'] = S['FD'] = S.F; // stem directions are irrelevant with full notes
  
  (t = this.TieEnd)['H'] = t.Q;     t['HL'] = t.QL;     t['HR'] = t.QR; // half notes have the same outer shape as quarter/shorter notes
      
  this['noteWidth']        = S.Q.CA.width;
  // distance by which the right end of a chord is shifted out when a right side outcropping note is present (in a chord with upwards stem)
  this['noteRightOutcrop'] = (S.QR.Ref.x + S.QR.CA.width) - (S.Q.Ref.x + S.Q.CA.width);
  [ 'U', 'D' ].forEach(function(X) { createSprite('S'  + X, C.Note.Stem, List[X]);
                                     var Q = S['S' + X], p;     Q['offsL'] = 1;     Q['offsR'] = Q.CA.width - 1; // ??? TODO
                                     Q['cenx']  = C.Note.Stem.Pvt.x;
                                     Q['stubL'] = Q.CA.width - (Q['stubR'] = -Math.round(this.line * C.Beam.stubWidth));
                                     for(var i = 8;     i <= 64;     i *= 2)
                                       (p = createSprite('L' + i + X, C.Note.Flag[i], List[X]))['stemAdd'] = (X === 'D' ? p.CA.height + p.Ref.y : p.Ref.y);  });

  createSprite('D1', C.Dots, 1); // multiple dots and dotted full notes are rarely used ——> rendered on demand

  for(i = 1;     i <= 64;     i *= 2)     createSprite('R' + i, C.Rest['R' + i]);
  
  ['Flat2', 'Flat', 'Natural', 'Sharp', 'Sharp2'].forEach(function(X, i) { (X = createSprite('A'+(i-2), C.Accidental[X]))['outLeft'] = S.Q.Ref.x - X.Ref.x; });
  
  Sp['noteOutRefShift'] = { 'L': S.QL.Ref.x - S.Q.Ref.x,   'R': S.QR.Ref.x - S.Q.Ref.x };
  this.Stm         = { 'true': S.SU, 'false': S.SD }; // shortcut for easier retrieval by *Chord.stemUp*
  this.StmCen      = { 'true': S.SU.Ref.x + S.SU.cenx,   'false': S.SD.Ref.x + S.SD.cenx };
  this.maxStmWidth = Math.max(S.SU.CA.width, S.SD.CA.width);
};


// only call after *initialize()*
mScore.Renderer.prototype['requestAdditionalSprite'] = function(name) {
  var X = this.Sprites2[name], C = this.Const, N = name.match(/\D+|\d+/g);
  if(X)   return X; // sprite already exists
  switch(N[0]) {
    case 'CFs':   return this.Sprites2[name] = C.Clef.F.createSprite(name, this, C.Clef.smallFactor); // small F clef
    case 'CGs':   return this.Sprites2[name] = C.Clef.G.createSprite(name, this, C.Clef.smallFactor); // small G clef
    case 'D':     
    case 'DF':    return this.Sprites2[name] = C.Dots  .createSprite(name, this, undefined, +N[1]);   // multiple dots, including full-note version
    default:      return mScore.Err('"' + name + '" is not a known additional sprite');
  };
};
/**********************************************************************************************************************/