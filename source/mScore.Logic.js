/* global Node, mScore */

﻿/**************************************************************************************************************************************************************/
/**                                                          Data type: Visible/invisible rest or tacet                                                      **/
/**************************************************************************************************************************************************************/

(mScore.Rest = function(value, visible, Voice, yOffset) {
  this.x       = 0;
  this.y       = 0;
  this.value   = value; // usually a reference into mScore.Values, but a number (of bars) if *isTacet* === true
  this.visible = visible;
  this.isTacet = false;
  this.tAt     = 0; // time where this rest begins
  this.Voice   = (Voice ? Voice : null);
  this.yOffset = (yOffset ? yOffset : 0);
  this.Bar     = undefined;
  this.Stave   = (Voice ? Voice.curStave.curClef : undefined);
}).prototype = {
  type:     'R',
  tVal:     function()  { return (this.isTacet ? 0 : this.value.tVal); }, // if it's a full-bar rest we probably do not know its exact length yet,
                                                                          // it is subject to the bar length
  toString: function()  { var x = (this.visible ? '*' : '.');     if(this.isTacet)   x += x;     return x; }
};

﻿/**************************************************************************************************************************************************************/
/**                                                Data type: Tuplet (mostly for use in rhythm patterns)                                                     **/
/**************************************************************************************************************************************************************/

// E.g. (8, 3, 5) is a quintuplet that covers the length of 3 eights
mScore['Tuplet'] = function(lengthUnit, length, splitNumber, type) {
  this.repeat = (type === 's');
  if(type === 'p')   this.rhythmPatternTuplet = true;
  this.lengthUnit = lengthUnit;
  if((this.splitNumber = splitNumber) < 2)   return mScore.Err('There is no such thing as a ' + splitNumber + '-tuple, must be at least 2');
  if(splitNumber > 10)   return mScore.Err('We cannot handle tuplets larger than 10, sorry! Received ' + splitNumber);
  if(length)                   this.length = length;
  else if(splitNumber === 2)   this.length = 3; // this will be the most common usage of a 2-tuple
  else   for(this.length = 1;     splitNumber > 1;     splitNumber = splitNumber >>> 1)   this.length += this.length;
  this.tVal  = this.lengthUnit.tVal * this.length; // absolute duration of the whole tuplet group
  this.style = 'a';
};

mScore.Tuplet['parse'] = function(S, isRhythmPattern, unit) {
  if(!(isRhythmPattern ? mScore.RhythmPatternFormat : mScore.VoiceFormat).tp.test(S))     return mScore.Err('Syntax error in tuplet switch "' + S + '"');
  var s = S.match(/[sudan]|\d+/g), x, type = (isRhythmPattern ? 'p' : undefined), style, i = 0, length;
  if(/[udan]/.test((x = s[s.length - 1])))   { style = x;     s.pop(); }
  if((x = s[i]) === 's')   { style = 's';     x = s[++i]; }
  if(isRhythmPattern)   { if((unit = +x) === 0 || !(unit = mScore.Values[unit]))
                            return mScore.Err('"' + s[0] + '" is no valid note value; check tuplet "' + S + '"');
                          x = s[++i];                                                                               }
  if(i < s.length - 1)  { if((length = +x) === 0)   return mScore.Err('A tuplet with a length of 0 makes no sense. Encountered "' + S + '"');
                          x = s[++i];                                                                                                           }
  if((S = new mScore.Tuplet(unit, length, +x, type)).isError)     return S;
  if(style)   S.style = style;     return S;
};

mScore['TupletInstance'] = function(Tuplet) {
  this.It        = [ ];
  this.lastItem  = null;
  this.Tuplet    = Tuplet;
  this.tAt       = 0;
  this.BG        = null; // will be set if the tuplet's content consists of a single beamed group, or part of one
  this.beam      = null; // either a reference to *this.BG.beam* or an object that is like it if there's no *this.BG*
  this.stemUp    = undefined;
};
mScore.TupletInstance.prototype = {
  type:    'AppTup',
  Advance: function(value, nDots) { return (this.tAt += value.tValDots(nDots, this)) < this.Tuplet.tVal; },
  Layout:  function(Renderer) {
    var It = this.It, i, ie = It.length - 1, C, t;
    if((C = It[0].BG) && C === It[ie].BG)   { this.beam = (this.BG = C).beam;     this.stemUp = C.stemUp;     return; }
    this.beam = this.beam || new mScore.P2d(0, 0);
    for(i = 0, t = 0;     i <= ie;     ++i)     t += (It[i].stemUp ? 1 : -1);
    this.stemUp = (t >= 0);
    var It2 = [ ];
    for(i = 0;     i <= ie;     ++i)
      if((C = It[i]).type === 'C') {
        if(!C.BG)   C.xS = C.x + Renderer.Spaces.chordShift * (C.shiftAmount || 0) + Renderer.StmCen[C.stemUp]; // TODO!! full notes??
        It2.push({ xS: C.xS,   y1: C.yBound(Renderer, this.stemUp) });
      } else C['xS'] = C.x;
    if(It2.length < 2)   this.beam.Set(0, It2.length ? It2[0].y1 : -Renderer.line);
    else                 mScore.oneSidedOptimum(It2, this.stemUp, Renderer.Const.Beam.maxSlope, this.beam);
    this.beam['lam'] = Math.sqrt(1 + this.beam.x * this.beam.x);
  }
};

﻿/**************************************************************************************************************************************************************/
/**                                                                Data type: Rhythm pattern                                                                 **/
/**************************************************************************************************************************************************************/

mScore['RhythmPattern'] = function() {
  this.idx         = undefined;
  this.Values      = [ ]; // either standard note values from mScore.Values or tuplet switches (instances of mScore.Tuplet)
  this.nDots       = [ ];
  this.beamIn      = [ ];
  this.cur         = 0;
  this.curTuplet   = [ ];
  this.nTuplet     = 0; // used length of *curTuplet*, so we can avoid actual array length changes
  this.Prev        = { value: null, nDots: 0 }; // previous note, used for shortening notes after dots
};

/** All this is much more complicated than it ought to be, but apparently we need to be able to handle nested tuplets, which is a bother **/
mScore.RhythmPattern.prototype = {
  ApplyAndAdvance: function(Item) { // *Item* is a chord or a rest
    var nDots = (Item.nDots || 0) + this.nDots[this.cur];
    if(nDots > (Item.value = this.Values[this.cur]).maxDots)
      return mScore.Err('A ' + Item.value.name + ' note received ' + (Item.nDots ? Item.nDots + ' dots' + (this.nDots[this.cur] ? ' plus ' : '') : '') +
                        (this.nDots[this.cur] ? this.nDots[this.cur] + 'dots from the rhythm pattern' : '') +
                        ', but can have at most ' + Item.value.maxDots + ' dots.');
    if(nDots)   Item.nDots = nDots;
    // a note will ignore the previous note's dots if it has some of its own, or if it has a different note value
    if(!nDots && Item.value === this.Prev.value)   Item.value = mScore.Values[Item.value.val << this.Prev.nDots];
    // Note: Since *Item.value* is a standard note value object, it does not contain the tuplet stretch factor
    if(this.nTuplet) { Item['Tuplet'] = (this.nTuplet === 1 ? this.curTuplet[0] : this.curTuplet.slice(0, this.nTuplet));
                       for(var i = 0, C;     i < this.nTuplet;     ++i)     (C = this.curTuplet[i]).It.push(C.lastItem = Item);   }
    this.Advance(nDots);     return mScore.lastError;
  },
  Advance:    function(nDots)  { // *nDots* will be ignored if a tuplet ends/start/restarts here, i.e. dots do not carry into or out of tuplets
    this.Prev.nDots = nDots;     this.Prev.value = this.Values[this.cur];
    var i = 0, C, n = this.nTuplet;
    while(i < n && this.curTuplet[i].Advance(this.Values[this.cur], nDots))     ++i; // tuplets which haven't ended yet
    if((C = ((this.nTuplet = i) < n)))   this.Prev.nDots = 0; // true iff a tuplet has just ended; *this.nTuplet* is the number of remaining open tuplets
    // all other tuplets that are nested inside the previous ones must properly end here too
    while(++i < n)   if(this.curTuplet[i].Advance(this.Values[this.cur], nDots))
      return new mScore.Error('Nested not ended properly');
    if(C && this.curTuplet[this.nTuplet].repeat)    { (C = this.curTuplet[this.nTuplet++]).tAt = 0; // outermost ending tuplet may restart
                                                      C.repetitions = (C.repetitions || 0) + 1;       }
    // all tuplets which are full have been properly ended or restarted, now add any that start at this place
    while(this.cur < this.Values.length && this.Values[this.cur] instanceof mScore.Tuplet)
      { this.curTuplet[this.nTuplet++] = new mScore.TupletInstance(this.Values[this.cur++]);     this.Prev.nDots = 0; }
    if(this.cur === this.Values.length)   return mScore.Err('Rhythm pattern ended while tuplet was not finished yet');
    if(!this.single && this.Values.length === ++this.cur)   this.Reset();
    return mScore.noError;
  },
  Reset:      function()  { this.Prev.nDots = this.cur = this.nTuplet = 0;
                            while(this.Values[this.cur] instanceof mScore.Tuplet)
                              this.curTuplet[this.nTuplet++] = new mScore.TupletInstance(this.Values[this.cur++]);   },
  beamInNow:  function()  { return this.beamIn[this.cur]; },
  toString:   function()  { return '[Pattern ' + this.idx + ' of ' + this.Values.length + ' items]'; }
};

/** Normal voice flow with explicit note value/tuplet switches is treated as a special dynamic rhythm pattern containing one note value **/
mScore.RhythmPattern['singleNote'] = function(defaultValue) {
  var RP = new mScore.RhythmPattern();
  RP.Values[0]    = mScore.Values[defaultValue]; // default note is quarter
  RP.nDots [0]    = 0;
  RP.beamIn[0]    = false;
  RP['single']    = true;
  RP['SetValue']  = this.fctSetValue;
  RP['SetTuplet'] = this.fctSetTuplet;
  RP['toString']  = this.fctToString;
  return RP;
};
mScore.RhythmPattern['fctSetValue']  = function(Value)
  { if(this.nTuplet && (C = this.curTuplet[this.nTuplet - 1]).repetitions && C.tAt === 0)   --this.nTuplet; // note value switches stop tuplet repetition
    var C;     this.Values[0] = this.Prev.value = Value;     this.Prev.nDots = 0;                             };
mScore.RhythmPattern['fctSetTuplet'] = function(Tuplet)
  { this.SetValue(Tuplet.lengthUnit); // start tuplet with its length unit, because that's the most common usage
    this.curTuplet[this.nTuplet++] = new mScore.TupletInstance(Tuplet);   }; // if a tuplet is active, a nested inner tuplet will be added
mScore.RhythmPattern['fctToString']  = function() { return '[Single note ' + this.Values[1].name + ']'; };


(function(splitCh, sp) {
  mScore.RhythmPattern['parse'] = function(S, Tokenizer) {
    if(sp.test(S))   return new mScore.Error('Rhythm pattern cannot be empty');
    var E = new mScore.RhythmPattern(),   c, c0, s, j = -1;
    Tokenizer.prepare(S, 'RhythmPattern', false);
    while((c0 = c, c = Tokenizer.takeType()))     switch((s = Tokenizer.curItem), c) {
      case 'tg':  return Tokenizer.Err('Rhythm patterns cannot contain any XML tags, found ' + s);
      case 'nn':  return Tokenizer.Err('Cannot understand content "' + s + '"');
      case 'b_':  if(c0 !== 'ch')   return Tokenizer.Err('A beam connector must follow a note value');
                  break;
      case 'ch':  if(!(E.Values[++j] = mScore.Values[+((s = s.match(splitCh))[0])]))
                    return Tokenizer.Err('Unknown note value "' + s + '" in rhythm pattern');
                  E.nDots [j] = (s.length - 1) && s[1].length; // if there's too many dots, the error will be thrown once we try to use the pattern
                  E.beamIn[j] = (c0 === 'b_');     break;
      case 'tp':  if(c0 === 'b_')   return Tokenizer.Err('A tuplet switch cannot follow a beam connector');
                  if((E.Values[++j] = mScore.Tuplet.parse(s, true, mScore.Values['4'])).isError)     return E.Values[j]; // note value is just to avoid errors, it isn't used
                  break;
    }
    return E;
  };
})(/\d+|\.+/g, /^\s*$/);

﻿/**************************************************************************************************************************************************************/
/**                                                                    Data type: Chord                                                                      **/
/**************************************************************************************************************************************************************/

mScore.Chord = function() {
  // items which every item has
  this.tAt           = 0; // time where this chord begins
  this.Bar           = undefined;
  this.Stave         = undefined;
  this.key           = 0; // the key that is applied to this chord (added for efficiency)
  this.nDots         = 0;
  this.Voice         = null;
  this.x             = undefined;
  this.value         = undefined;
  // this.Tuplet       // added when needed
  // this.mergeGroup   //
  // this.ColorStyle   //
  // this.tieTo        //
  // this.tieFrom      //
  // this.tieIn        // set for a tie if it is a proper tie as opposed to a slur (important for audio playback)
  // this.tieOut       //
  // this.beamCutAfter //
  this.P             = [ ]; // array of Notes + *y* field; fill later
  this.y1            = 0; // bottommost y for upwards stem, or Chord reference for unified chords
  this.stemDirection = 'a';
  this.stemUp        = undefined; // actual direction after layouting, true=up, false=down
  this.BG            = null;
};


mScore.Chord.prototype['type'] = 'C';


mScore.Chord['fromItem'] = function(It, forMerging) {
  var E = new mScore.Chord(), i, ie, P;
  E.tAt   = It.tAt;
  E.Bar   = It.Bar;
  E.Stave = It.Stave;
  E.key   = It.key;
  E.Voice = It.Voice;
  E.nDots = It.nDots;
  E.value = It.value;
  if(It.ColorStyle)   E.ColorStyle = It.ColorStyle;
  if(It.Tuplet)       E.Tuplet     = It.Tuplet;
  if(It.isFull)       E.isFull     = true;
  switch(It.type) {
    case 'R':   break;
    case 'C':
      E.stemDirection = It.stemDirection;
      //E.nBeamCut      = It.nBeamCut;
      for(i = 0, ie = It.P.length;     i < ie;     ++i) {
        P = E.P[i] = It.P[i];
        if(!P.ColorStyle && forMerging && It.ColorStyle)   P.ColorStyle = It.ColorStyle;
        if(forMerging)   P.Voice = It.Voice;
      }
      break;
  }
  return E;
};


// We trust that *tAt* and Bar of the chords agree.
mScore.Chord.prototype['mergeIn'] = function(It) {
  if(this.nDots  !== It.nDots)      return new mScore.Error('Merged notes must have the same number of dots');
  if(this.value  !== It.value)      return new mScore.Error('Merged notes must have the same note value');
  if(this.Tuplet !== It.Tuplet)     return new mScore.Error('Merged notes cannot belong to different kinds of tuplets');
  if(this.Stave  !== It.Stave)      return new mScore.Error('Notes cannot be merged across different staves');
  if(It.type !== 'C')     return this;
  // TODO!! Beam cut stuff
  if(It.stemDirection !== 'a')
    if(this.stemDirection === 'a')   this.stemDirection = It.stemDirection;
    else if(this.stemDirection !== It.stemDirection)   return It.Err('Merged notes cannot have different explicit stem directions: '+this.stemDirection+' vs '+ It.stemDirection+' at '+
    (new mScore.Time(It.tAt)));
  for(var i = 0, P = It.P, ie = P.length, Pnew;     i < ie;     ++i) {
    this.P.push(Pnew = P[i]);
    if(!Pnew.ColorStyle && It.ColorStyle)   Pnew.ColorStyle = It.ColorStyle;
  }
  return this;
};


mScore.Chord.prototype['LayoutStemDirection'] = function(stemUp) {
  if(this.value === mScore.Values['1'])   this.isFull = true;   else if(this.isFull)   delete this.isFull;
  if(stemUp !== undefined)    { if(stemUp === this.stemUp)   return; }
  else  { stemUp = (this.stemDirection === 'u');
          if(this.stemDirection === 'a')   stemUp = this.P[0].pitch + this.P[this.P.length - 1].pitch < this.Stave.magic[3];
          if(stemUp === this.stemUp) return; // OK like it is
        }
  this.stemUp = stemUp;
  if(this.P.length === 1) return;
  this.y1 = this.P[0].y;
  this.P.reverse();
};


(function(sortDown, sortUp) {
  mScore.Chord.prototype['SortPitches'] = function(stemUp) {
    this.P.sort((this.stemUp = (stemUp !== false)) ? sortUp : sortDown);
    this.y1 = this.P[this.P.length - 1].y;
  };
})(function(A, B) { return B.pitch - A.pitch; },   function(A, B) { return A.pitch - B.pitch; });


(function(AtoG, splitter) {
  mScore.Chord['parse'] = function(S, Voice, stemDirection) {
    if(!mScore.Tokenizer.Voice.tokens.ch.test(S))
      return mScore.Err('Error in syntax for a chord. Encountered "' + S + '"'); // syntax error; empty strings are also illegal
    S = S.match(splitter);
    var E = new this() /* Chord constructor */,   i = 0,   C,   shiftAmount = 0,   inSuffixes = true,   i1 = S.length;
    while(inSuffixes)   switch((C = S[--i1]).substring(0, 1)) { // now dealing with all kinds of suffixes
      case '-':
        if(C.length === 1)   { E['accent'] = C;     break; }
        // intentional fall-through
      case '+':
        if(!AtoG.test(C))   { E['shiftVertical'] = +C;     break; } // the big test above has already checked that the number literal is well-formed
        inSuffixes = false;   break; // reached the last note literal, so we are finished with suffixes
      case 'o':   case '^':   case '>':   case '\'':     E['accent'] = C;         break;
      case 'c':   case 'a':   case 'u':   case 'd':      stemDirection = C;       break; // override default stem orientation
      case 's':                                          ++shiftAmount;           break;
      case 'r':                                          --shiftAmount;           break;
      case '.':                                          E.nDots = C.length;      break;
      case 'm':
        if((E['mergeGroup'] = (C.length === 1 ? 1 : +C.substring(1))) === 0)
          return mScore.ErrOffs('Merge group index cannot be zero, encountered "' + S.join('') + '"', S.slice(0, i1).length);
        break;
      default: // a note literal not beginning with + or -
        inSuffixes = false;
    }
    while(i <= i1) {
      E.P.push(C = new mScore.Note(S[i++])); // syntax check in Note constructor redundant, has already been checked
      C.pitch += Voice.keyBase; // incorporate octave shift
      C['y'] = 0; // add field to Note object
    }
    E.Voice         = Voice;
    E.stemDirection = stemDirection || 'a';
    if(shiftAmount !== 0)     E['shiftAmount'] = shiftAmount; // add field only when necessary
    return E;
  };
})(/[A-G]/, /[+\-=]*[A-G][#0b]*|\.+|[+\-][\d.]+|m\d*|[caudrso\^>'-]/g);


// redo-safe
mScore.Chord.prototype['LayoutAccidentals'] = function(Renderer) {
  var i, fl = false, t = this.P[0].pitch - 2, outcropL = 0, x, p, out, S = Renderer.Sprites;
  for(i = 0;     i < this.P.length;     ++i) {
    if((p = this.P[i]).noteOut)   p.noteOut = undefined; // reset
    if((fl = (out = t - (t = p.pitch)) * out <= 1 && !fl))
      p['noteOut'] = (this.stemUp ? 'R' : 'L' );
    x = (p.noteOut === 'L' ? S.Q.Ref.x - S.QL.Ref.x : 0);
    if(p.acc !== undefined)   { p['xAcc'] = x;     x += S['A' + p.acc].outLeft; }
    else                      if(p.xAcc) delete p.xAcc;
    if(x > outcropL)   outcropL = x;
    if(p.noteOut === 'R')   this['rightOutcrop'] = Renderer.noteRightOutcrop;
  }
  if(outcropL !== 0)   this['leftOutcrop'] = outcropL; // positive value
  else                 if(this.leftOutcrop) delete this.leftOutcrop;
};


mScore.Chord.prototype['LayoutDots'] = function(Renderer) {
  var i = this.P.length, ie = -1, s = -1, y0, y2, p;
  if(!this.stemUp) { ie = i;     i = -1;     s = 1; }
  while((i += s) !== ie) {
    y2 = (p = this.P[i]).y;
    if(!((this.Stave.magic[0] - p.pitch) & 0x01) && (y2 -= Renderer.halfLine) === y0)   y2 += Renderer.line;
    if(y2 !== y0)   y0 = p['yDots'] = y2;
  }
};


// redo-safe
mScore.Chord.prototype['Layout'] = function(Renderer) {
  if(this.stemUp === undefined)   this.SortPitches(this.stemDirection !== 'd');
  if(this.typeBG === 'L')   this.BG.LayoutStemDirection(); // also sets *stemDirection* of all chords of the beamed group (to "u" or "d", never "a")
  else if(!this.BG)         this.LayoutStemDirection();

  var m = this.Stave.magic[0], i, P = this.P;
  for(i = 0;     i < P.length;     ++i)     P[i].y = (m - P[i].pitch) * Renderer.halfLine + this.Stave.Stave.y;
  this.y1 = P[i - 1].y;
  
  if(this.rightOutcrop)   this.rightOutcrop = 0; // reset so it isn't added doubly on redoing the layout
  this.LayoutAccidentals(Renderer);
  if(this.nDots) {
    var Dotto = (this.nDots === 1 && !this.isFull ? Renderer.Sprites.D1 : Renderer.requestAdditionalSprite((this.isFull ? 'DF' : 'D') + this.nDots));
    this['rightOutcrop'] = (this['xDots'] = this.rightOutcrop || 0) + Dotto.CA.width;
    this.LayoutDots(Renderer);
  }
  if(this.tupletEnd && this.BG && this.tupletEnd.BG === this.BG)   this['tupletBG'] = true;
  else if(this.tupletBG !== undefined)   delete this.tupletBG;
  if(this.type === 'CI') {
    if(this.top    === undefined)     this.top    = m;
    if(this.bottom === undefined)     this.bottom = m;
    this['yTop']    = (m - this.top)                     * Renderer.halfLine + this.Stave.Stave.y;
    this['yBottom'] = (m - this.bottom)                  * Renderer.halfLine + this.Stave.Stave.y;
    this['rCorner'] = Renderer.Const.InputMarker.rCorner * Renderer.halfLine;
    if(!this.fixed)     this.ColorStyle = Renderer.inputColor;
  }
};


// if *noteIdx* is not specified an array is returned
// if *AppendList* (an array) is specified and not *noteIdx*, the results are added to it
mScore.Chord.prototype['actualNote'] = function(noteIdx, addValues, AppendList, timeTied) {
  var noteIdxEnd = noteIdx, p, acc, E, El, outOffs = 0, C;
  if(noteIdx === undefined)   {
    noteIdx = 0;     noteIdxEnd = this.P.length - 1;
    outOffs = (E = AppendList || [ ]).length;
  }
  while(noteIdx <= noteIdxEnd) {
    if((p = this.P[noteIdx++]).tieFrom && timeTied && p.tieFrom.hasTie)   continue; // note is being tied to from a previous one ——> don't play
    acc = p.acc; // explicit accidental always takes precedence
    if(acc === undefined)     acc = p.accInherited;
    if(acc === undefined)     acc = p.accidentalFromKey(this.key);
    El = new mScore.Note(p.pitch, acc ? acc : undefined);
    if(addValues) {
      El['tAt']  = this.tAt;
      El['tVal'] = this.value.tValDots(this.nDots || 0, this.Tuplet);
      if(timeTied && (C = this).tieTo)
        while(p.tieTo)   { El.tVal += (C = p.tieToChord).value.tValDots(C.nDots);     p = p.tieTo; }
    }
    if(E)     E[outOffs++] = El;     else     E = El;
  }
  return E; // do not pass through explicit naturals
};


// if *noteIdx* is omitted, the first note is used
mScore.Chord.prototype['SetNote'] = function(Renderer, target, value, noteIdx) {
  var N, p = this.P[noteIdx || 0], acc, B = this.Bar;
  switch(target) {
    case 'pitch':
      switch(typeof value) {
        case 'string':
          if((N = new mScore.Note(value)).isError)     return N;
          p.pitch = N.pitch;     acc = N.acc;
          break;
        case 'number':     p.pitch = value;     acc = p.acc;     break;
        default:
          if(!(value instanceof mScore.Note))     return new mScore.Error('Unrecognized type of pitch value', B, this.Voice);
          p.pitch = value.pitch;     acc = value.acc;     break;
      }
      if(this.type === 'CI') {
        if(p.pitch > this.top)      p.pitch = this.top;
        if(p.pitch < this.bottom)   p.pitch = this.bottom;
      }
      break;
    case 'accidental':     acc = value;     break;
  }
  if(acc !== p.acc) {
    if(acc !== undefined)   p.acc = acc;     else if(p.acc !== undefined)   p.acc = undefined;
    if(this.type === 'CI' && !this.fixed)
      if(acc !== undefined)   this.NoteUnfixed.acc = acc;
      else if(this.NoteUnfixed.acc !== undefined)   this.NoteUnfixed.acc = undefined;
    this.LayoutAccidentals(Renderer);
  }
  else {
    this.SortPitches(this.stemUp);
    for(noteIdx = 0;     this.P[noteIdx] !== p;     ++noteIdx); // stupid way to find the new note again in the re-sorted array (no pointers in JavaScript)
  }
  this.LayoutStemDirection();
  //B.CalculateNaturalWidth(Renderer);
  B.Layout(Renderer, B.width); // stretch/squeeze bar to leave total width unchanged, so that line alignment doesn't get messed up
  return noteIdx;
};


mScore.Chord.prototype['SetFix'] = function(fix, updateUnfixedDummy) {
  if(this.type !== 'CI')
    return new mScore.Error('SetFix: Only chords marked as input can be fixed/unfixed', this.Bar, this.Voice);
  if(this.fixed === fix)     return;
  if((this.fixed = fix))     this.ColorStyle = this.ColorStyleFixed;
  else { this.ColorStyleFixed = this.ColorStyle;
         if(updateUnfixedDummy)   this.NoteUnfixed = new mScore.Note(this.P[0].pitch, this.P[0].acc);   }
};


mScore.Chord.prototype['yBound'] = function(Renderer, topOrBottom) {
  var t = (this.stemUp ? 1 : -1);
  if(this.stemUp === topOrBottom)
    if(this.BG)   return (t = this.BG.beam).x * this.xS + t.y; // assumes the beam has been layed out already
    else        { t = this.y1 - (this.value.val >= 2 ? t * (Renderer.Spaces.stemLength + (this.shiftVertical || 0) * Renderer.line) : 0);
                  return (this.value.val >= 8 ? t + Renderer.Sprites['L' + this.value.val + (this.stemUp ? 'U' : 'D')].stemAdd : t);        }
	else            return this.P[0].y + t * Renderer.halfLine;
};


mScore.Chord.prototype['Err'] = function(txt) { return mScore.Err(txt, this.Bar, this.Voice); };

mScore.Chord.prototype.toString = function() { return this.P.join(''); }; // implicitely calling *toString* of the Notes that make up P

﻿/**************************************************************************************************************************************************************/
/**                                                                 Data type: BeamedGroup                                                                   **/
/**************************************************************************************************************************************************************/

mScore.BeamedGroup = function() {
  this.stemDirection = 'a';
  this.stemUp        = undefined;
  this.beam          = new mScore.P2d(0, 0); // outer edge of the beam as 2D vector (k,d) via y=k*x+d
  this.nMaxBeams     = 1;
  this.beamPattern   = [ ];
  this.tAt           = 0; // time where this group begins
  this.lastCh        = null;
  this.Ch            = [ ];
};


mScore.BeamedGroup.prototype['type'] = 'BG';


mScore.BeamedGroup.prototype['add'] = function(Chord) {
  if(Chord.P.length === 0)   return; // can happen as a result of chord merging
  Chord.BG = this;
  Chord['typeBG'] = (this.Ch.push(this.lastCh = Chord) === 1 ? 'L' : 'R');
  if(this.stemDirection !== (this.stemDirection = Chord.stemDirection))
    for(var i = 0;     i < this.Ch.length;     ++i)     this.Ch[i].stemDirection = this.stemDirection; // the last chord's stem direction governs all the others
};


// TODO!! Two-sided beams; especially crossing staves
mScore.BeamedGroup.prototype['LayoutStemDirection'] = function() {
  var t = 0, p, Ch = this.Ch, i = 0, ie = Ch.length - 1, stemUp = (this.stemDirection === 'u');
  for(;     i <= ie;     ++i)     if((p = Ch[i]).stemUp === undefined)   p.SortPitches(true); // ensure each chord has a (random) well-defined orientation
  switch(this.stemDirection) {
    case 'a': // use average chord excentricity to find direction of the whole beamed group
      for(i = 0;     i <= ie;     ++i)     t += (p = Ch[i].P)[0].pitch + p[p.length - 1].pitch; // 2 * average pitch
      stemUp = (t < (ie + 1) * Ch[0].Stave.magic[3]);
    case 'u':   case 'd':
      for(this.stemUp = stemUp, i = 0;     i <= ie;     ++i)     Ch[i].LayoutStemDirection(stemUp);
      break;
    case 'c': // beam between high and low notes
      this['twoSided'] = true;
      if(ie === 1) { // simplified case if there are only two notes
        t = ((p = Ch[0].P)[0].pitch + p[p.length - 1].pitch) < ((p = Ch[ie].P)[0].pitch + p[p.length - 1].pitch); // whether the 2nd note is higher than the 1st
        Ch[0].LayoutStemDirection(t);     Ch[1].LayoutStemDirection(!t);
        this.stemUp = true; // TODO!! This will need some sort of modification
        return;
      }
      // for larger chords TODO!!
  }
};


(function(sortFct) {
  mScore.BeamedGroup.prototype['FindOptimumSeparationBeam'] = function() {
    var msl = Renderer.Const.Beam.maxSlope, k, Ch = this.Ch, Z = [ ], j, je = Ch.length, p, p1, t, s, min = 0, minWhere = null, minK;
    for(j = 0;     j < je;     ++j)     { Z[j] = [ 0, 0, 0 ];     Ch[j].LayoutStemDirection(true); }
    for(var i = 0;     i < 9;     ++i) {
      for(k = msl * (2 * (i / 8) - 1), j = 0;     j < je;     ++j)
        { (p = Z[j])[0] = j;     p[1] = (p1 = Ch[j]).P[0].y - (t = p1.x * k);     p[2] = p1.y1 - t;   }
      Z.sort(sortFct);
      for(j = 1, s = 1 / Math.sqrt(1 + k * k);     j < je;     ++j)
        if((t = (Z[j][1] - Z[j - 1][2]) * s) < min)   { minWhere = j;     minK = k;     min = t; }
    }
    for(j = 0;     j < minWhere;     ++j)   Ch[Z[j][0]].LayoutStemDirection(true);
    for(;          j < je;           ++j)   Ch[Z[j][0]].LayoutStemDirection(false);
  };
})(function(A, B) { return (B[1] + B[2]) - (A[1] + A[2]); }); // sort by y position of the middle of the chord


mScore.BeamedGroup.prototype['FindOptimumBeamSlope'] = function(Renderer) {
  var Ch = this.Ch, i, ie = Ch.length, j, B = (this.beam = this.beam || new mScore.P2d(0, 0)), CB = Renderer.Const.Beam, p, t = Renderer.Spaces.chordShift;
  for(i = 0;     i < ie;     ++i)     Ch[i].xS = (p = Ch[i]).x + t * (p.shiftAmount || 0) + Renderer.StmCen[p.stemUp]; // x of the centers of the note stems
  if(this.stemDirection === 'c') {
    this.stemUp = true; // TODO!!
    if(Ch.length === 2)   { B.x = 0;     B.y = (Ch[0].y1 + Ch[1].y1) / 2; }
    else  { this.FindOptimumSeparationBeam();
            var ChU = [ ], ChD = [ ], BU = new mScore.P2d(0, 0), BD = new mScore.P2d(0, 0);
            for(i = 0;     i < ie;     ++i)     ((p = Ch[i]).stemUp ? ChU : ChD).push(p);
            if(ChU.length > 1)   mScore.oneSidedOptimum(ChU, this.stemUp, Renderer.Const.Beam.maxSlope, BU);
            if(ChD.length > 1)   mScore.oneSidedOptimum(ChD, this.stemUp, Renderer.Const.Beam.maxSlope, BD);
            if     (ChU.length === 1)   B.Set(BD.x, (BD.y + (p = ChU[0]).y1 - BD.x * p.xS) / 2);
            else if(ChD.length === 1)   B.Set(BU.x, (BU.y + (p = ChD[0]).y1 - BU.x * p.xS) / 2);
            else                        B.Set(BU).Add(BD).Div(2);                                  }
    B.y -= (this.nMaxBeams * CB.width + (this.nMaxBeams - 1) * CB.sep) * Renderer.line / 2;
    B['lam'] = Math.sqrt(1 + B.x * B.x);
  } else
    { mScore.oneSidedOptimum(Ch, this.stemUp, Renderer.Const.Beam.maxSlope, B);
      B['lam'] = Math.sqrt(1 + B.x * B.x);
      B.y -= (this.stemUp ? 1 : -1) * (Renderer.Spaces.stemLength + (this.nMaxBeams * CB.width + (this.nMaxBeams - 1) * CB.sep) * Renderer.line * B.lam);   }
  if((p = Ch[ie - 1]).shiftVertical) { // incorporate vertical beam shifts and re-determine which chords fall above or below it
    if(Ch[0].shiftVertical) { B.x += (t = -Renderer.halfLine * (p.shiftVertical - Ch[0].shiftVertical) / (p.xS - Ch[0].xS));
                              B.y -= Renderer.halfLine * p.shiftVertical + t * p.xS;                                          }
    else                      B.y -= Renderer.halfLine * p.shiftVertical;
    for(i = 0;     i < ie;     ++i)     (p = Ch[i]).LayoutStemDirection((p.y1 + p.P[0].y) / 2 >= B.x * p.xS + B.y);
  }
};


mScore.BeamedGroup.prototype['setBeamNumbers'] = function() {
  var P = this.Ch, p, i, ie = P.length - 1, inBeam, j = -2, j0, b, stave = P[0].Stave.idx;     this.nMaxBeams = -1;
  for(i = 1;     i <= ie;     ++i)     if(P[i].Stave.idx !== stave)   { this['staveSwitch'] = true;     break; }
  do {
    for((i = 0, inBeam = false), (j0 = ++j, ++this.nMaxBeams);     i <= ie;     ++i)
      if((b = (p = P[i]).value.nBeams) > this.nMaxBeams) {
        if(inBeam)   this.beamPattern[j] = i;
        else         { j = this.beamPattern.push(i);     this.beamPattern.push(i);     inBeam = true; }
        if((b -= p.beamCutAfter || 0) <= this.nMaxBeams)   inBeam = false;
        if(b <= 0)   return new mScore.Error('Tried to cut ' + p.beamCutAfter + ' beams, that’s too many', p.Bar, p.Voice);
      } else inBeam = false;
  } while(j !== j0 ? this.beamPattern.push(true) : false);
  this.beamPattern.pop();
  for(j = 0, j0 = this.beamPattern.length;     j < j0;     j += 2) {
    if((p = this.beamPattern[j]) === true)   { --j;      continue; }
    if(p !== this.beamPattern[j+1])   continue; // true beam, not a stub
    if(p === ie || (p > 0 && P[p - 1].nDots > 0))     this.beamPattern[j]     = null; // left side stub
    else                                              this.beamPattern[j + 1] = null; // right side stub
  }
  return mScore.noError;
};


// compare to other 
mScore.BeamedGroup.prototype['compare'] = function(BG2) {
  var t = this.tAt - BG2.tAt;
  if(t !== 0) return t;
  if((t = this.beamPattern.length - BG2.beamPattern.length) !== 0) return t;
  for(var i = 0, P1 = this.beamPattern, P2 = BG2.beamPattern;     i < P1.length;     ++i)
    if((t = P1[i] - P2[i]) !== 0) return t;
  return 0;
};


mScore.BeamedGroup.prototype['toString'] = function() { return this.Ch.join('_'); };


﻿/**************************************************************************************************************************************************************/
/**                                                                    Data type: Voice                                                                      **/
/**************************************************************************************************************************************************************/

(function(numAttr, stemDirs, yesNo) {
  mScore.Voice = function(Piece, Attr) {
    this.Piece            = null;
    this.BG               = [ ]; // array of beamed groups, referencing chords
    this.curValue         = '4'; // quarter note
    this.keyBase          = 0;
    this.keyMajor         = true;
    this.tAt              = 0; // time where this voice begins
    this.stemDirection    = 'a';
    this.restPos          = 0;
    this.singleNoteRhythm = mScore.RhythmPattern.singleNote(4);
    this.curRhythm        = this.singleNoteRhythm;
    this.curColor         = null;
    this.curStave         = null;
    this.justDidTacet     = false; // just for parsing
    this.idx              = 1; // which voice this is
    this.nBars            = 0;
    this.hasPickup        = false;
    
    if(!Piece)   return;
    this.idx      = Piece.Voices.length + 1; //Piece.Voices.push(V);
    this.Piece    = Piece;
    this.curStave = Piece.Staves[0];
    this.curColor = Piece.ColorStyles[0]; // start with default color
    
    if(!Attr)   return this;
    if(Attr.stem && !(this.stemDirection = stemDirs[Attr.stem]))
      return mScore.Err('Stem direction must be "up", "down", or "auto"; encountered "' + stemDirs[Attr.stem] + '"', 'attrib', this);
    if(Attr.pickup && (this.hasPickup = yesNo[Attr.pickup]) === undefined)
      return mScore.Err('Pickup attribute must be "yes" or "no", got "' + Attr.pickup + '"', 'attrib', this);
    if(Attr.stave)   if(typeof (S = numAttr.call(this, Attr, 'stave', 1, Piece.Staves.length)) !== 'number')   return S;
                     else this.curStave = Piece.Staves[S - 1];
    if(Attr.key) {
      if(typeof (S = mScore.keyBase(Attr.key)) !== 'number')     return S.Prefix('Voice no.' + this.idx + ': ', 'attrib', this);
      if(this.curStave.key !== null && this.curStave.key !== (S || undefined)) {
        for(var i = 0;   Piece.Voices[i].curStave !== this.curStave;   ++i);
        return mScore.Err('Voices ' + (i+1) + ' and ' + this.idx + ' both lie in stave ' + this.curStave.idx +
                          ' but have different initial key signatures', 'attrib', this);
      }
      this.curStave.key = S || undefined; // Key C major should be value *undefined*, so that no natural sign is displayed
    }
    if(Attr.color)      if(typeof (S = numAttr.call(this, Attr, 'color', 0, Piece.ColorStyles.length - 1)) !== 'number')   return S;
                        else this.curColor = Piece.ColorStyles[S];
    if(Attr.restPos)    if(typeof (this.restPos = numAttr.call(this, Attr, 'restPos')) !== 'number')   return this.restPos;
    return this;
  };
})(function(Attr, name, minVal, maxVal) {
  var S = Attr[name];
  if(typeof S !== 'number' && (typeof S !== 'string' || !/^[+\-]?\d+$/.test(S)))
    return mScore.Err('"' + name + '" attribute must be a number, encountered "' + S + '"', 'attrib', this);
  if((S = +S) < minVal || S > maxVal)
      return mScore.Err('"' + name + '" attribute must ' + (minVal === maxVal ? 'be ' + minVal : 'lie between ' + minVal + ' and ' + maxVal), 'attrib', this);
  return S;
},   {'up':'u', 'down':'d', 'auto':'a'},   {yes: true, no: false});


mScore.Voice.prototype = {
  Octavate: function(nOctaves) { this.keyBase += 7 * nOctaves; },
  toString: function( )        { return 'voice no.' + this.idx; }
};
