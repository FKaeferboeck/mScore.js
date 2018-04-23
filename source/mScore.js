
/**************************************************************************************************************************************************************/
/**                                                                   The namespace object                                                                   **/
/**************************************************************************************************************************************************************/

mScore = {
  P2d         : null, // helper classes, defined below
  MinMax      : null, //
  
  Renderer    : null, // constructor, see file mScore.Renderer.js

  Stave       : null,
  Chord       : null, // defined below
  Voice       : null,
  BeamedGroup : null,

  Values      : null,
  versionDate : new Date(2018, 4 - 1, 17) // january is month 0 in JavaScript, how silly is that?
};


/**************************************************************************************************************************************************************/
/**                                                             2D point with vector operations                                                              **/
/**************************************************************************************************************************************************************/

(mScore.P2d = function(x, y)  { if(y !== undefined) { this.x = x;       this.y = y;   }
                                else                { this.x = x.x;     this.y = x.y; } }).prototype = {
  Set:          function(x, y)      { if(y !== undefined) { this.x = x;       this.y = y;     return this; }
                                                            this.x = x.x;     this.y = x.y;   return this;     },
  cp:           function( )         { return new mScore.P2d(this.x, this.y); }, // just a shortcut for the copy constructor
  Map:          function(fct)       { this.x = fct(this.x);     this.y = fct(this.y);     return this; },
  Neg:          function( )         { this.x = -this.x;     this.y = -this.y;     return this; },
  Add:          function(x, y)      { if(y !== undefined) { this.x += x;       this.y += y;       return this; }
                                                            this.x += x.x;     this.y += x.y;     return this;     },
  AddMultiple:  function(P, t)      { return this.Add(P.x * t, P.y * t); },
  Sub:          function(x, y)      { if(y !== undefined) { this.x -= x;       this.y -= y;       return this; }
                                                            this.x -= x.x;     this.y -= x.y;     return this;     },
  Mul:          function(t)         { this.x *= t;     this.y *= t;     return this; },
  Div:          function(t)         { this.x /= t;     this.y /= t;     return this; },
  AddPolarD:    function(r, angle)  { angle *= Math.PI/180;     this.x += r * Math.cos(angle);     this.y += r * Math.sin(angle);     return this; },
  norm:         function( )         { return Math.sqrt(this.x * this.x + this.y * this.y); },
  dot:          function(P)         { return this.x * P.x + this.y * P.y; },
  dst:          function(x, y)      { if(y === undefined) return Math.sqrt((y = this.x - x.x) * y + (y = this.y - x.y) * y);
                                                          return Math.sqrt((x -= this.x) * x + (y -= this.y) * y);             },
  toString:     function( )         { return '[' + this.x + ',' + this.y + ']'; }
};


mScore['offset'] = function(Element) { // standard copypasta code
  var rect = Element.getBoundingClientRect();
  return new mScore.P2d(Math.round(rect.left) + (window.pageXOffset || document.documentElement.scrollLeft),
                        Math.round(rect.top)  + (window.pageYOffset || document.documentElement.scrollTop));
};

mScore['mousePosition'] = function(Canvas, Event)
  { return new mScore.P2d(Event.clientX, Event.clientY).Sub(mScore.offset(Canvas)); };
  
mScore['parseNum'] = function(x) { return (isNaN((x = +x)) ? false : x); };
mScore['trim']     = (function(RegExp) { return function(s) { return (s + '').replace(RegExp, ''); }; })(/^\s+|\s+$/g);

/**************************************************************************************************************************************************************/
/**                                                                      Error class                                                                         **/
/**************************************************************************************************************************************************************/

(mScore.Error = function(msg /*, ... = bar or (bar, voice) or SourcePos */) {
  this.isError = true;
  this.msg     = msg;
  this.type    = 'basic'; // 'basic', 'element', or 'filePos'
  
  this.Element     = null;      // element of a mScore.PieceDescription object
  this.elementName = undefined; // a name of *Element*
  this.inContent   = false;     // whether the error is in the content or in the opening tag
  this.offset      = 0;
  
  this.title  = undefined;
  this.line   = 0;
  this.column = 0;
  
  this.bar     = null;
  this.voice   = null;

  mScore.lastError = this;
}).prototype = {
  toString: function() {
    var S = 'Error in score';
    if(this.title)   S += ' “' + this.title + '”';
    switch(this.type) {
      case 'element': if(!this.inContent)   { S += ' at ' + this.elementName +
                                                   (this.hasPosition ? ' (line ' + (this.line + 1) + ', column ' + (this.column + 1) + '):' : ':');     break; }
      case 'filePos': S += (this.inContent ? ' in' : ' at') + ' ' + this.elementName +
                           ' (line ' + (this.line + 1) + ', column ' + (this.column + 1) + '):';             break;
      case 'basic':   S += ':';
    }
    S += '\n';
    if(this.attrName)   S += 'Attribute “' + this.attrName + '”: ';
    S += this.msg;
    /*var pi = this.title || 'piece';\
    switch(this.type) {
      case 'basic':       return 'Error in mScore source code:\n' + this.msg;
      case 'filePos':     return 'Error in mScore source file at line ' + (this.line + 1) + ', column ' + (this.column + 1) + '.\n' +
                                 this.Element.substr(0, 1).toUpperCase() + this.Element.substr(1) + ': ' + this.msg;
      case 'sourcePos':   return 'Error in mScore element ' + this.Element + ' (line ' + (this.line + 1) + ', column ' + (this.column + 1) + '):\n' + this.msg;
      case 'bar':         return 'Error in mScore ' + pi + ', ' + this.bar + ':\n' + this.msg;
      case 'voice':       return 'Error in mScore ' + pi + ', ' + this.voice + ':\n' + this.msg;
      case 'barVoice':    return 'Error in mScore ' + pi + ', ' + this.bar + ', ' + this.voice + ':\n' + this.msg;
    }*/
    return S;
  },
  Add: function(/* ... */)    { for(var i = 0, p;     i < arguments.length;     ++i)
                                  if(typeof (p = arguments[i]) === 'string')   this.msg   = p + this.msg; // prefix to error message
                                  else if(p instanceof mScore.Bar)             this.bar   = p;
                                  else if(p instanceof mScore.Voice)           this.voice = p;
                                return this;                                                     },
  Attr: function(attrName)    { this.attrName    = attrName;        return this; },
  Name: function(elementName) { this.elementName = elementName;     return this; },
  SetTokenizerPos: function(Tokenizer, offset, iItem) { // call this BEFORE *SetPieceDescription* so that the position gets set correctly
    var Pos = Tokenizer.getPosition(iItem, (this.offset = offset || this.offset));
    this.column = (Pos.line > 0 ? Pos.column : this.column + Pos.column);     this.line += Pos.line;
    this.hasPosition = true;     return this;
  },
  SetPieceDescription: function(PiDe, ObjType, id, name, inContent) {
    this.Element = PiDe;   var i, XML, OT = ObjType;
    for(i = 0, ObjType = ObjType.split('.');     i < ObjType.length;     ++i)     this.Element = this.Element[ObjType[i]];
    if(id !== undefined)   this.Element = this.Element[id];
    this.elementName = this.elementName || name;
    this.inContent   = !!inContent;
    if(!(XML = PiDe.XMLDocument))   { this.type = 'element';     return this; }
    this.type = 'filePos';
    var El = PiDe.getXMLElement(OT, id);
    var S = XML.sourceUntil(El, inContent).split(/\r\n?|\n/g);
    if(this.line === 0)   this.column += S[S.length - 1].length;
    this.line += S.length - 1;
    return this;
  },
  Title: function(title) { this.title = title;     return this; }
};

mScore['Err']       = function(msg, a, b) { return new mScore.Error(msg, a, b); }; // shortcut because it occurs in many places in the code
mScore['ErrOffs']   = function(msg, offs) { var E = new mScore.Error(msg);     E.column = offs;     return E; }; // for errors in items; will be modified through the tokenizer
mScore['noError']   = { isError: false,   toString: function() { return 'everything’s alright, yeah'; } };
mScore['lastError'] = mScore.noError;

/**************************************************************************************************************************************************************/
/**                                                              Minimum-Maximum helper class                                                                **/
/**************************************************************************************************************************************************************/

/** @param {function} evalFct **/ 
(mScore.MinMax = function(evalFct, evalData) {
  this.min    = undefined;
  this.minRef = undefined;
  this.max    = undefined;
  this.maxRef = undefined;
  if(evalFct)   this.evalFct = evalFct; // otherwise use prototype default
}).prototype = {
  evalFct:  function(x)       { return x; }, // default value
  push:     function(x, data) { var y = this.evalFct.call(data, x);
                                if(!(y >= this.min))   { this.min = y;     this.minRef = x; }
                                if(!(y <= this.max))   { this.max = y;     this.maxRef = x; }     return this;   },
  reset:    function( )       { this.min = this.minRef = this.max = this.maxRef = undefined;     return this; },
  span:     function( )       { return this.max - this.min; }
};

// helper function for finding beam and tuplet slopes
mScore['oneSidedOptimum'] = (function(MM1, MM2) {
  return function(Ch, stemUp, maxSlope, Beam) {
    MM2.reset();     MM1.Ch = Ch;
    for(var i = 0, ie = Ch.length, j;     i < ie - 1;     ++i) // test all pairs of notes; O(n³) time, but beamed groups are small
      for(j = i + 1;     j < ie;     ++j)     MM2.push((Ch[j].y1 - Ch[i].y1) / (Ch[j].xS - Ch[i].xS), MM1); // slope from Ch[i] to Ch[j]
    if((Beam.x = MM2.minRef) >  maxSlope)     Beam.x =  maxSlope;
    if( Beam.x               < -maxSlope)     Beam.x = -maxSlope;
    MM2.evalFct.call(MM1, Beam.x);
    Beam.y = stemUp ? -MM1.max : -MM1.min;
  };
})(new mScore.MinMax(),
   new mScore.MinMax(function(k) { this.reset();
                                   for(var Ch = this.Ch, i = 0, ie = Ch.length;     i < ie;     ++i)     this.push(Ch[i].xS * k - Ch[i].y1);
                                   return this.span();   })   );

/**************************************************************************************************************************************************************/
/**                                                                FIFO queue helper class                                                                   **/
/**************************************************************************************************************************************************************/

(mScore.Queue = function(initialCapacity) {
  this.Q       = new Array(initialCapacity);
  this.capLeft = initialCapacity;
  this.i0      = 0;
  this.i1      = 0;
}).prototype = {
  push:  function(Elem) {
    if(this.capLeft === 0)   { this.Q.splice(this.i1++, 0, Elem);     return this; }
    if(this.i1 === this.Q.length)     this.i1 = 0; // wrap around end of array
    this.Q[this.i1++] = Elem;     --this.capLeft;
    return this;
  },
  pop:   function() {
    if(this.capLeft === this.Q.length)   return undefined; // Queue is empty
    var Elem = this.Q[this.i0];
    this.Q[this.i0] = undefined; // so not to interfere with garbage collection
    if(++this.i0 === this.Q.length)     this.i0 = 0;
    ++this.capLeft;     return Elem;
  },
  peek:  function(idx) {
    if(this.capLeft === this.Q.length)   return undefined; // Queue is empty
    return this.Q[(this.i0 + (idx || 0)) % this.Q.length];
  },
  clear: function() {
    var Q = this.Q, i = 0, ie = Q.length;
    while(i < ie)     Q[i++] = undefined;
    this.i0 = this.i1 = 0;     this.capLeft = Q.length;
    return this;
  }
};

/**************************************************************************************************************************************************************/

mScore['valueBase'] = 2 * 64 * 9 * 5 * 7; // so all possible note values including reasonable tuplets are integers
mScore['Values']    = (function() {
  var fun = function(inverse, name, head, nBeams, next) {
    this.tVal   = mScore.valueBase / inverse;
    this.val    = inverse;
    this.name   = name;
    this.head   = head;
    this.nBeams = nBeams;
    this.next   = next;
  },   V;
  fun.prototype = {
    tValDots: function(nDots, Tuplet) { var tVal = (nDots ? this.tVal * ((2 << nDots) - 1) / (1 << nDots) : this.tVal);
                                        return (Tuplet ? (tVal * Tuplet.Tuplet.length) / Tuplet.Tuplet.splitNumber : tVal);   },
    toString: function()              { return this.name; }
  };
  var E = { 1 : new fun( 1, 'whole',   'F', 0,  '2'),
            2 : new fun( 2, 'half',    'H', 0,  '4'),
            4 : new fun( 4, 'quarter', 'Q', 0,  '8'),
            8 : new fun( 8, '8th',     'Q', 1, '16'),
           16 : new fun(16, '16th',    'Q', 2, '32'),
           32 : new fun(32, '32th',    'Q', 3, '64'),
           64 : new fun(64, '64th',    'Q', 4, null),
            0 : ((V = new fun( 1, 'zero')).tVal = 0, V)   };
  E['bestTacet'] = function(tVal) { for(var i = 1;     i < 64;     i += i)     if(tVal > this[i + i].tVal)   return this[i];     return this['64'];   };
  for(var i = 1, j = 6;     i < 64;     i += i)     E[i]['maxDots'] = j--;
  return E;
})();


// just for more readable display of time values (e.g. position of chords in a bar)
(mScore['Time'] = function(T, minDen) {
  this.tVal = T; // assumed to be using the unit mScore.valueBase
  this.num = Math.abs(T);     this.den = mScore.valueBase; // numerator, denominator; now we will cancel the fraction
  while(true) { // Euclid's algorithm
    if((this.num %= this.den) === 0) { this.num = T / this.den;                    this.den = (mScore.valueBase / this.den);     break; }
    if((this.den %= this.num) === 0) { this.den = mScore.valueBase / this.num;     this.num = (T / this.num);                    break; }
  }
  if(minDen)   while(this.den < minDen)   { this.num *= 2;     this.den *= 2; }
}).prototype['toString'] = function() { return this.num + (this.den === 1 ? '' : '/' + this.den); };

/**************************************************************************************************************************************************************/
/**************************************************************************************************************************************************************/


(mScore['keyBase'] = function(key) {
  if(!/^\s*[A-G](?:bb|b|##|#)?\s*(?:major|maj|minor|min)?\s*$/.test(key))
    return mScore.Err('"' + key + '" is not a valid key signature');
  key = key.match(/[A-Gb#]|min/g); // "minor" contains "min" and the majors are default
  var i = 0, base = 0;
  while(i < key.length)     base += mScore.keyBase.keyBases[key[i++]];
  return base;
})['keyBases'] = { C : 0, D : 2, E : 4, F : -1, G : 1, A : 3, B : 5, b : -7, '#' : 7, min : -3 };


mScore['fifthCircle'] = function(n) {
  var E = '';
  if(typeof n === 'number') {
    while(n >  5)   { E += '#';     n -= 7; }
    while(n < -1)   { E += 'b';     n += 7; }
    return 'FCGDAEB'.substr(n + 1, 1) + E;
  } else {
    if(!/^\s*(?:[#b]*\s*[A-H]|[A-H]\s*(?:#+|b*))\s*$/.test(n))
      return mScore.Err('"' + n + '" is not a valid key signature');
    E = 0;
    n.match(/[A-H#b]/g).forEach(function(x) { E += {F:-1, C:0, G:1, D:2, A:3, E:4, B:5, H:5, '#':7, b:-7}[x] || 0; });
    return E;
  }
};


mScore['pitchSteps']    = [ 0, 2, 4, 5, 7, 9, 11 ];
mScore['invPitchSteps'] = [ 0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6 ];
mScore['accPitchDelta'] = { 'bb': -2,   'b': -1,   '0': 0,   '#': 1,   '##': 2 };
mScore['pitches']       = { 'C': 0, 'D': 1, 'E': 2, 'F': 3, 'G': 4, 'A': 5, 'B': 6, 'H': 6, '+': 7, '-': -7, '=': -14 };


// also serves do determine known types of clefs
/** [0]   on which line to place the pitch C4 (SPN), measured in halftone steps downwards from the uppermost stave line
    [1]   where to draw # key signatures
    [2]   where to draw b key signatures
    [3]   for determining automatic stem directions   **/
mScore['magicNumbers'] = {
  'G' : [ 10, 0, 4,  13],
  'F' : [ -2, 5, 6, -11]
};


mScore['barlines'] = {
  '|': '1',   '||': '2',   '|||': '3',   ':||': 'e',   '||:': 'b',   ':||:': 'eb',
  '1'  : 'a single bar line',
  '2'  : 'a double bar line',
  '3'  : 'an end sign',
  'e'  : 'an end repeat sign',
  'b'  : 'a begin repeat sign',
  'eb' : 'an end and begin repeat sign'
};

/**************************************************************************************************************************************************************/
/**                                                                  Data type: Color style                                                                  **/
/**************************************************************************************************************************************************************/

mScore.ColorStyle = function(RGBcolor) {
  this.isDefault = !RGBcolor;
  this.Color     = (this.isDefault ? '#000000' : RGBcolor);
};
mScore.ColorStyle.prototype['toString'] = function() { return this.Color; };

/**************************************************************************************************************************************************************/
/**                                                    Data type: Note — also used to describe intervals                                                     **/
/**************************************************************************************************************************************************************/

// Usage of constructor:
// 1) A1 = string, A2 = undefined --> A1 = e.g. "+Eb"
// 2) A1 = pitch value, A2 = accidental (integer, optional)
// 3) A1 = number of semitone steps from base note C, A2 = "semitones"
(mScore['Note'] = function(A1, A2) {
  if(A2 === 'semitones') {
    // octavated tritones (A1 ≡ 6 (mod 12)) are represented by octavated F#
    this.pitch = (Math.floor((A1) / 12) * 7 + (A2 = mScore.invPitchSteps[A1 = ((A1 % 12) + 12) % 12]));
    if((A1 -= mScore.pitchSteps[A2]))     this.acc = A1;
    return;
  }
  if(typeof A1 === 'number') {
    this.pitch = A1;
    if(A2 !== undefined)   this.acc = A2; // only add property when necessary
    return;
  }
  if(! /^[\+\-=\s]*[A-H][0#b\s]*$/.test(A1))   return mScore.Err('"' + A1 + '" is not a valid note value');
  A1 = A1.match(/[\+\-=A-H0#b]/g);
  this.pitch = 0;
  for(var i = 0, c, p;     i < A1.length;     ++i)
    if((p = mScore.pitches[c = A1[i]]) !== undefined)   this.pitch += p;
    else this.acc = (this.acc || 0) + mScore.accPitchDelta[c];
  // this.tieTo        //
  // this.tieToChord   //
  // this.tieFrom      //
  // this.tieFromChord //
  // this.tiePointOut  // number 0,...,8 specifying where the tie is attached to the note
  // this.tiePointIn   //
  // this.hasTie       // if it is a proper tie, not a slur
}).prototype = {
  semitonePitch:     function() { var t = ((this.pitch % 7) + 7) % 7;     return mScore.pitchSteps[t] + (this.pitch - t) / 7 * 12 + (this.acc || 0); },
  accidentalFromKey: function(key) // For explanation of the formula, see document developerInfo/sharpFormula.html
    { return Math.ceil((key - ((((2*this.pitch+1) % 7) + 7) % 7)) / 7); },
  // transpose the note by an interval and/or an accidental.
  // Note that a shift by e.g. a fifth is represented as *Interval* === new mScore.Note(4) (not 5)
  // *Interval.acc* is always measured UPWARDS, e.g. an augmented downward fifth is (-4, -1).
  Shift:             function(Interval) {
    var t = Interval.semitonePitch() + this.semitonePitch();
    this.pitch += Interval.pitch;
    t -= this.semitonePitch();
    if(this.acc !== undefined)   this.acc = (this.acc + t) || undefined;
    else if(t !== 0)             this.acc = t;
    return this;
  },
  interval:          function(Note1, Note2) {
    var E = new mScore.Note(Note2.pitch - Note1.pitch), // without accidentals at first
        t = Note2.semitonePitch() - Note1.semitonePitch();
    E['semitones'] = t; // for convenience, maybe somebody wants to use it
    if((t -= E.semitonePitch()) !== 0)   E.acc = t;
    E['isInterval'] = true;
    return E;
  },
  equal:             function(Note2) { return this.pitch === Note2.pitch && (this.acc || 0) === (Note2.acc || 0); },
  toString:         (function(dimaug, dimaug1, dimaug0) { return function() {
    var E = '', t = this.pitch;
    if(this.isInterval) {
      if(Math.abs(this.semitones) === 6 && Math.abs(this.acc || 0) === 1)
        return 'tritone ' + (t > 0 ? 'up' : 'down');
      var t1 = Math.abs(t), acc = (t >= 0 ? 1 : -1) * (this.acc || 0);
      if(t === 0) { E = 'unison';
                    if(acc === 0)     return 'unison';
                    if(acc < 0)       acc = -(t = acc);
      } else        E = '' + (t1 + 1);
      E += (t >= 0 ? ' up' : ' down');
      if(dimaug[t1 % 7]) {
        if(t < 0)      --acc;
        if(acc > 3)    return acc  + '-fold augmented '  + E;
        if(acc < -4)   return (1-acc) + '-fold diminished ' + E;
        return dimaug1[acc + 4] + ' ' + E;      
      } else {
        if(acc > 3)    return acc  + '-fold augmented '  + E;
        if(acc < -3)   return (-acc) + '-fold diminished ' + E;
        return dimaug0[acc + 3] + E;
      }    
    } else {
      while(t >= 7)     { E += '+';     t -=  7; }
      while(t < -7)     { E += '=';     t += 14; }
      if   (t <  0)     { E += '-';     t +=  7; }
      E += 'CDEFGAB'.substr(t, 1);
      if((t = this.acc) === 0)     return E + '0'; // explicit natural sign
      while(t > 0)     { E += '#';     --t; }
      while(t < 0)     { E += 'b';     ++t; }
    }
    return E;
  }; })([ false, true, true, false, false, true, true ],
        [ 'triple diminished',  'double diminished',  'diminished ', 'minor', 'major', 'augmented', 'double augmented', 'triple augmented' ],
        [ 'triple diminished ', 'double diminished ', 'diminished ', '', 'augmented ', 'double augmented ', 'triple augmented ' ])
};

mScore.Note['newInterval'] = function(A1, A2) {
  var E = new mScore.Note(A1, A2);
  E['semitones']  = E.semitonePitch();
  E['isInterval'] = true;
  return E;
};

