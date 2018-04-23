/* global Node, mScore */

﻿/**********************************************************************************************************************/
/**                                              Data type: StaveClef                                                **/
/**********************************************************************************************************************/

mScore['StaveClef'] = function(Voice, clef) {
  if(!mScore.StaveClef.availableClefs[clef])   return mScore.Err('Expected "F" or "G" as value in <clef/> tag, received "' + clef + '"');
  this.Voice        = Voice; // required to correctly set time values of items in bar
  this.Stave        = Voice.curStave;
  this.idx          = this.Stave.idx; // shortcut
  this.sortIdx      = this.Stave.idx;
  this.clef         = clef;
  this.validFromBar = null; // bar in which this clef switch occurs
  this.magic        = mScore.magicNumbers[clef]; // shortcut
  this.tAt          = undefined; // so it can be used as an item in a bar
  this.x            = 0;
};

mScore.StaveClef['availableClefs'] = { 'F': true, 'G': true };

mScore.StaveClef.prototype['type']     = 'clef';
mScore.StaveClef.prototype['value']    = mScore.Values['0']; // so it can be used as an item in a bar
mScore.StaveClef.prototype['toString'] = function() { return '[' + this.clef + ' clef in stave ' + this.idx +';'+this.tAt+']'; };

﻿/**********************************************************************************************************************/
/**                                                Data type: Piece                                                  **/
/**********************************************************************************************************************/

mScore.Piece = function(PiDe, Tokenizer) {
  this.Voices             = [ ];
  this.Macros             = { };
  this.width              = 500;
  this.nextStaveOffs      = 70;
  this.nextLineOffs       = 100;
  this.Bars               = [ undefined ];
  this.Lines              = undefined;
  this.RhythmPatterns     = [ ];
  this.ColorStyles        = [ new mScore.ColorStyle() ]; // default color (black) which uses no stencilling
  this.align              = 'justify';
  this.playbackInstrument = 'piano';
  this.drawingOffset      = new mScore.P2d(0, 0);
  this.startBar           = 1;
  this.baseBeat           = mScore.Values['4'];
  this.tempo              = 120;
  this.title              = '';
  this.composer           = '';
  this.composerExtra      = '';
  this.Staves             = [ ];
  this.timeSignatureStyle = 'auto';
  this.clef               = 'G'; // right now supporting 'G', 'F', and 'piano'
  this.Tokenizer          = Tokenizer || new mScore.Tokenizer();

  if(!PiDe)   return;
  if(PiDe.XMLDocument)   this.XML = PiDe.XMLDocument;
  var i, j, V, C, p, staves = PiDe.staves || [ { clef: this.clef } ];
  for(var key in PiDe.info)      this[key] = PiDe.info [key]; // No checking! TODO maybe!!
  for(    key in PiDe.style)
    if(key !== 'colors')   this[key] = PiDe.style[key]; // No checking! TODO maybe!!
    else if((V = PiDe.style.colors).length) // predefined default color stays as color 0
      for(i = 0;     i < V.length;     ++i)     this.ColorStyles[i + 1] = new mScore.ColorStyle(V[i]);
  for(i = 0;     i < staves.length;     ++i)     switch((C = staves[i].clef)) {
    case 'G':   case 'F':     this.AddStave(C);                               break;
    case 'piano':             this.AddStave('G');     this.AddStave('F');     break;
    default:                  return mScore.Err('Only supported clef values so far are "G", "F" and "piano"; received "' + this.clef + '"');
  }
  for(i = 0;     i < PiDe.RP.length;     ++i) {
    if((C = mScore.RhythmPattern.parse(PiDe.RP[i], this.Tokenizer)).isError)                     return PiDe.Err('RP', i);
    C.idx = this.RhythmPatterns.push(C);
  }
  if((V = PiDe.MC)) {
    for(i = 0;     i < V.length;     ++i)     if((p = V[i].name))   this.Macros[p] = true; // mark name as taken
    for(i = 0;     i < V.length;     ++i) { // doesn't do a lot; tokenizes macro content & counts/checks number of arguments
      if((p = (C = V[i]).name) && typeof this.Macros[p] === 'object')                            return PiDe.Err('MC', i, 'There already exists a macro with that name');
      if(!p)   { for(j = 1;     this.Macros[j];     ++j);     p = '' + j; } // unnamed macro ——> give it the smallest available number as name
      if((this.Macros[p] = new mScore.Macro()).Init(p, C.content, C.args).isError)               return PiDe.Err('MC', i).Name(this.Macros[p].toString());
    }
  }
  for(i = 0;     i < PiDe.VC.length;     ++i) {
    if(this.Voices.push((C = new mScore.Voice(this, (V = PiDe.VC[i]).attributes))), C.isError)   return C;
    if(V.content && this.add(C, V.content).isError)       /* here the real work gets done! */    return PiDe.Err('VC', i);
  }
  for(i = 0;     i < PiDe.MV.length;     ++i)
    if(this.add(this.Voices, PiDe.MV[i].content).isError) /* here the real work gets done! */    return PiDe.Err('MV', i);
};


mScore.Piece.prototype['AddStave'] = function(clef) {
  var ie = this.Staves.length, prev = (ie === 0 ? null : this.Staves[ie - 1]), St;
  if(!mScore.magicNumbers[clef])     return mScore.Err('Stave no.' + (ie + 1) + ': "' + clef + '" is not a valid clef');
  St = { clef : clef,
         key  : null, // leave key at *null* (a value which is no valid key, unlike *undefined*)
         y    : 0 };
  St['idx']                         = this.Staves.push(St);
  St['initialClef'] = St['curClef'] = new mScore.StaveClef({curStave: St}, clef);
  St['Stave']                       = St; // to avoid errors when calling .Stave.Stave on a StaveClef object
  St['sortIdx']                     = -1; //St.idx - .5; // so that after sorting clef changes precede all chords of the same time and stave
  if(prev)   { this.nextLineOffs += this.nextStaveOffs;     St.y = prev.y + this.nextStaveOffs; }
  return mScore.noError;
};


mScore.Piece.prototype['GetBar'] = function(idx) {
  var B;
  if(idx === 0) {
    if(this.startBar === 1)     this.startBar = (this.Bars[0] = new mScore.Bar(this)).idx = 0;
    return this.Bars[0];
  }
  while(this.Bars.length <= idx)   (B = new mScore.Bar(this)).idx = this.Bars.push(B) - 1;
  return this.Bars[idx];
};


(function() {
  var tieBeginPoints = { 'u1': 2, 'u0': 1, 'u-1': 1, 'd1': 1, 'd0': 1, 'd-1': 8 },
      tieEndPoints   = { 'u1': 4, 'u0': 5, 'u-1': 5, 'd1': 5, 'd0': 5, 'd-1': 6 };
  var tieTimeSorter  = function(A, B) { return A.tieToTime - B.tieToTime; };
  
mScore.Piece.prototype['Layout'] = function(Renderer, width) {
  this.width = width;
  var i, ie, C, tAt = 0, j, je = this.Staves.length, je2, Bars = this.Bars, B, I, k = 0, p, p2, acc, acc2, isTie, pos, J, m;
  var collectTies = [ ]; // does that save time? It might.
  var tieQueue = this.Voices.map(function() { return [ ]; }); // quick way to construct an array of empty arrays
  var keys = this.Staves.map(function(X) { return X.key; });
  var curMeter = 0;
  for(j = 0;     j < je;     ++j)   this.Staves[j].curClef = this.Staves[j].initialClef;
  
  // Set time values of items and register their Bar/Stave references
  for(i = this.startBar, ie = Bars.length;     i < ie;     ++i) {
    (B = Bars[i]).tAt = tAt;     // set start time of bar
    B.LayoutTimes(); // set start times of items in bar (as offsets from bar start) and sorts them by time
    if(B.key)   for(j = 0;     j < je;     ++j)     if(B.key[j] !== undefined)     keys[j] = B.key[j];
    for(j = 0, je2 = (C = B.Ch).length;     j < je2;     ++j)   switch((I = C[j]).type) {
      case 'C':   case 'CI':
        // check whether an open tie/slur ends at this chord —— we allow multiple ties to end at one chord
        while((p = tieQueue[I.Voice.idx - 1]).length > 0 && tAt + I.tAt >= (p2 = p[0]).tieToTime) {
          if(tAt + I.tAt > p2.tieToTime)              return J.Err('The tie/slur starting at ' + (new mScore.Time((J = p2.tieFrom).tAt, 4)) +
                                                                   ' cannot properly end at a chord of voice ' + J.tieTo);
          (collectTies[k++] = J = p2.tieFrom).tieTo = I; // thus it is a tie *J* ——> *I*
          p.shift(); // drop from tie queue
          if((p = J.notesOfTieTo)) {
            if((p2 = p.length) !== I.P.length)        return J.Err('The "to" argument of a <' + J.tieOutType + '/> contains ' + p2 +
                                                                   ' hints, but the following chord has ' + I.P.length + ' notes');
            for(m = 0, p = p.split('');     m < I.P.length;     ++m)     if((I.P[m]['noTieIn'] = (p[m] === '.')))   --p2;
          } else   p2 = I.P.length;
          if(p2 !== (J.numberNotesOut || J.P.length)) return J.Err('Trying to tie ' + (J.numberNotesOut || J.P.length) + ' notes to ' + p2 + ' notes');
          for(m = 0, p2 = -1;     m < J.P.length;     ++m) { // link notes, has to happen before they get sorted vertically
            if(J.P[m].noTieOut)   continue;
            while(++p2 < I.P.length && p && I.P[p2].noTieIn);
            if(I.P[p2].tieFrom)                       return I.Err('Multiple ties/slurs may end at the same chord, but not at the same note (' + I.P[p2] + ')');
            (J.P[m]['tieTo'] = I.P[p2])['tieFrom'] = J.P[m]; // link notes together; their chord references must be set later, they are subject to chord merging
          }
        }
        if(I.tieTo) {
          if(I.tieTo > this.Voices.length)
            return mScore.Err('Trying to tie/slur to something in voice ' + I.tieTo + ', there are only ' + this.Voices.length + ' voices.');
          if((p = tieQueue[I.tieTo - 1]).push({ tieFrom   : I,
                                                tieToTime : tAt + I.tAt + I.value.tValDots(I.nDots, I.Tuplet)}) > 1)
            p.sort(tieTimeSorter); // usually a trivial sorting, if it ever needs to be done at all
        }
        // deliberate fall-through
      case 'R':
        I.Stave = I.Stave.Stave.curClef;
        I.key = keys[I.Stave.idx - 1];
        break; // idx starts at 1
      case 'clef':
        I.Stave.curClef = I;     break;
    }
    tAt += B.tLen;
    // anacrusis does not count for measuring the meter; neither does the last bar
    if(this.timeSignatureStyle === 'auto' && i > 0 && i < Bars.length - 1 && B.tLen !== curMeter && B.tLen > 0)
      Bars[i === 1 ? this.startBar : i]['TimeSignature'] = new mScore.Time(curMeter = B.tLen, 4); // first bar time signature will be stored in the anacrusis
    if(i < ie - 1)
      if(Bars[i+1].style !== '1')   B['barLineOut'] = Bars[i+1].style;
      else if(B.barLineOut)         B .barLineOut   = undefined;
  }
  
  for(i = this.startBar, ie = Bars.length;     i < ie;     ++i)
    if((I = Bars[i].Layout(Renderer)).isError)     return I; // layout the bar internally, set its natural width; also deals with item merging

  // finish previously collected ties after chord merging is finished
  for(i = 0, ie = k;     i < ie;     ++i) {
    I = (C = collectTies[i]).tieTo; // now processing the tie/slur C ——> I (both are unmerged original chords, but may have their *mergeGroup* set)
    for((j = 0, je = C.P.length - 1), isTie = true;     j <= je;     ++j) {
      if((p = C.P[j]).noTieOut)   continue;
      p             ['tieToChord']   = I.mergeGroup || I;
      (p2 = p.tieTo)['tieFromChord'] = C.mergeGroup || C;
      // TODO!! Improve
      pos = (j === 0 ? 1 : (j === je ? -1 : 0)) * (C.stemUp ? -1 : 1); // -1: bottommost note;   1 topmost note;   0: between
      if(p.tieDirection === 'a')   p.tieDirection = (pos === -1 ? 'd' : 'u');
      if(p.tieDirection)   { p['tiePointOut'] = tieBeginPoints[(pos = p.tieDirection + pos)];     p2['tiePointIn'] = tieEndPoints[pos]; }
      // determine whether it is a tie or a slur; this happens with original unmerged chords, because a merged chord can contain BOTH a slur and a tie
      if((acc  = p .acc) === undefined && (acc  = p .accInherited) === undefined)   acc  = p .accidentalFromKey(C.key);
      if((acc2 = p2.acc) === undefined && (acc2 = p2.accInherited) === undefined)   acc2 = p2.accidentalFromKey(I.key);
      if(p.pitch !== p2.pitch || acc !== acc2)   isTie = false; // is really a tie, not a slur; difference only matters for audio playback
    }
    if(C.tieOutType === 'tie' && !isTie)   return C.Err('A <tie/> must have the same note values at both ends. Change note values or make it a <slur/>');
    if(C.tieOutType !== 'slur' && isTie)     for(j = 0;     j <= je;     ++j)     C.P[j]['hasTie'] = true; // explicit slurs stay so even if they could be ties
    (C.mergeGroup || C) .tieTo     = true; // links are now stored in the chords' notes, here we only need the flags
    (I.mergeGroup || I)['tieFrom'] = true; //
  }
  return this.LayoutLines(Renderer, 0);
};
})();


// split stuff into lines, calculate inter-bar spaces (they go into the *x* of the bars)
// Redoable!
mScore.Piece.prototype['LayoutLines'] = function(Renderer, dy) {
  var Bars = this.Bars, B, C, i;
  for(i = 0;     i < this.Staves.length;     ++i)     (B = this.Staves[i]).curClef = B.initialClef; // reset clefs to start values
  this.Lines = [ ];     i = this.startBar;
  while(i < Bars.length) {
    (C = (B = Bars[i]).Line = new mScore.Line(this, Renderer, C, this.width, dy)).idx = this.Lines.push(C); // new Line, index starting at 1. Also finds the end Bar
    i = C.endBar;
    C.HorizontalAlign(Renderer, this.align);
    dy += this.nextLineOffs;
  }
  return mScore.noError;
};


mScore.Piece.prototype['draw'] = function(CT, Renderer, dx, dy) {
  this.drawingOffset.Set(dx, dy);
  var j = 0, je = this.Lines.length;
  while(j < je)   this.Lines[j++].draw(CT, Renderer, dx, dy);
};


mScore.Piece['fromString'] = function(S) {
  var PiD = mScore.PieceDescription.fromXML(S);
  return (PiD.isError ? PiD : new mScore.Piece(PiD));
};


mScore.Piece.prototype['AddRhythmPattern'] = function(pattern) {
  var Q = mScore.RhythmPattern.parse(pattern);
  if(Q.isError)     return Q.Prefix('Rhythm pattern ' + (this.RhythmPatterns.length + 1) + ': ');
  Q.idx = this.RhythmPatterns.push(Q);
  return mScore.noError;
};


mScore.Piece.prototype['AddVoice'] = function(content, Attr) {
  var V = new mScore.Voice(this, Attr);     this.Voices.push(V);
  if(!V.isError)   this.add(V, content); // here the real work is done!
  return mScore.lastError;
};


mScore.Piece.prototype['SetKey'] = function(key, iBar, iStave) {
  var i = 0, P;
  if(typeof key === 'string')     if(typeof (key = mScore.keyBase(key)) !== 'number')     return key; // error
  if(iBar === undefined || iBar === this.startBar) {
    P = this.Staves;
    if(iStave !== undefined)     P[iStave].key = key;
    else do P[i].key = key; while(++i < P.length);
  } else {
    if(!(P = this.Bars[iBar]).key)     P['key'] = new Array(this.Staves.length);
    P = P.key;
    if(iStave !== undefined)     P[iStave] = key;
    else do P[i] = key; while(++i < P.length);
  }
  return mScore.noError;
};


mScore.Piece.prototype['necessaryHeight'] = function() {
  return this.Lines[this.Lines.length - 1].yTop + this.nextLineOffs + this.drawingOffset.y;
};


  // TODO!! no up/down markers on non-last beamed chords
// Function is a property of Piece and not of Voice because it also handles multi-voice elements
mScore.Piece.prototype['add'] = function(Voices, source) {
  var isMultivoice = (Voices.length !== undefined);
  if(!isMultivoice)   Voices = [ Voices ];
  var curBar, curVoice = Voices[0], iCurVoice = 0; // single voice or first of group of voices
  var T, C, A,   restIsVisible = false,   nBeamedGroups = curVoice.BG.length, i, ie, This = this, X;
  var Its = [ ], It1 = { type: '?' }, It2 = It1; // initial value to avoid errors; will be overwritten right away
  var pushIt = function(Item) { It2 = It1;     return (It1 = Item); }; // 2-element shift register for the last 2 added musical elements
  for(i = 0;     i < 2 * Voices.length;     ++i)   Its[i] = It1;
  var Err = function(msg) { return (msg ? new mScore.Error(msg) : mScore.lastError).Add(curBar, curVoice).SetTokenizerPos(This.Tokenizer); };
  //var Err        = function(msg) { return new mScore.Error(msg).Add(curBar).Add(curVoice).Offset(This.Tokenizer); }; // for convenience
  //var AugmentErr = function()    { return mScore.lastError     .Add(curBar).Add(curVoice).Offset(This.Tokenizer); };
  var trimmer = /^\s+|\s+$/gm, testInt = /^[\+\-]?\d+$/, testNum = /^[\+\-]?(?:\d+(?:\.\d*)|\.\d+)$/, tieSplit = /\d+|[ud\.]+/g;
  var arg = function(argName) { return ((argName = A[argName]) ? argName.replace(trimmer, '') : ''); };
  var argNum = function(argName, isInteger, defaultValue) {
    if(!A[argName])   return defaultValue;
    var x = A[argName].replace(trimmer, '');
    return ((isInteger ? testInt : testNum).test(x) ? +x :
            Err('Argument "' + argName + '" must be a' + (isInteger ? 'n integer' : ' number') + '; received "' + x + '"'));
  };

  // the following stuff needs to be done at the end of each bar, each voice switch and the end of the input
  var cycleVoice = function(reset, voiceIncrement) {
    var C, M, i, ie;
    if(!(isMultivoice || reset))   return Err('Voice switching with "\\" is only allowed in a <multivoice> environment');
    if(It1.type === 'BG')          return Err('Beamed group was not closed');
    while(nBeamedGroups < curVoice.BG.length) { // finish this bar's new beamed groups
      C = curVoice.BG[nBeamedGroups++];
      for(i = 0, ie = C.Ch.length - 1;     i < ie;     ++i)
        if(C.Ch[i].mergeGroup)   return Err('Only the last chord of a beamed group can have a merge marker');
      if((M = C.Ch[ie].mergeGroup)) // add merge group markers to all items of the beamed group & the group itself
        for(C.mergeGroup = M, (i = 0, ie = C.Ch.length - 1);     i < ie;     ++i)     C.Ch[i].mergeGroup = M;
      if((C = C.setBeamNumbers()).isError)   return C;
    }
    if(!isMultivoice)   return mScore.noError; // would not hurt much to remove this line, but never mind
    Its[2 * iCurVoice] = It1;     Its[2 * iCurVoice + 1] = It2; // save current values for retrieval when this voice is continued
    if((iCurVoice = (reset ? 0 : iCurVoice + (voiceIncrement || 1))) >= Voices.length)   return Err('Illegal voice switch: There\'re not that many voices');
    curVoice = Voices[iCurVoice];     It1 = Its[2 * iCurVoice];     It2 = Its[2 * iCurVoice + 1];
    nBeamedGroups = curVoice.BG.length;
    return mScore.noError;
  };
  
  var nextBar = function(barLineStyle, endTwoEndings) {
    var C = cycleVoice(true); // reset to first voice, finish beamed groups
    if(C.isError)   return Err(); //C.Prefix('', curBar, curVoice); // always use the first voice to register bar lines
    if(It1.type === 'B') // two consecutive barlines
      if(curBar.afterEndings)   { curBar.style = barLineStyle || '1';     return; }
      else                      return Err('There cannot be two consecutive bar lines. For an empty bar put .. (invisible full-bar rest) inside.');
    C = curBar;
    if(!(It2.type === 'R' && It2.isTacet === 2)) // explicit tacets automatically allocate the next bar, following bar line is optional
      pushIt(curBar = This.GetBar(++curVoice.nBars));
    if(barLineStyle && curBar.style && curBar.style !== barLineStyle)
      return Err('End of ' + This.GetBar(curVoice.nBars - 1) + ': Voices do not agree — Is it ' +
                 mScore.barlines[curBar.style] + ' or ' + mScore.barlines[barLineStyle] + '?');
    curBar.style = barLineStyle || '1';
    if(C.twoEndings && !(curBar.twoEndings || curBar.afterEndings)) {
      (C.twoEndings)[(C['endingIdx'] = C.twoEndings.length) - 1].lastBar = C;
      if(endTwoEndings)     curBar['afterEndings'] = true;
      else {
        if(curBar.style === 'e' || curBar.style === 'eb')     C.twoEndings.push({ firstBar: curBar,   lastBar: curBar });
        curBar.twoEndings = C.twoEndings;
      }
      // TODO!! ends must agree in voices
    }
    return curBar;
  };

  var addTie = function(voiceIdx, notesFrom, notesTo, directions, type) {
    if(It1.type !== 'C')                 return Err('A tie can only be between two chords' + (It1.type === 'b_' ? ' which are not connected by a beam' : ''));
    if(It1.tieTo)                        return Err('Only one group of ties can start at a chord. If you need more, use voice merging');
    var i, n = It1.P.length, p;
    if(voiceIdx === 0)                   return Err('Trying to tie to a chord in voice 0, that is not a valid voice index');
    else It1['tieTo'] = voiceIdx;
    if(notesFrom)
      if(!/^[\*\.]*$/.test(notesFrom))   return Err('The "from" argument of a <' + type + '/> must be a sequence of "*" and "."; received "' + notesFrom + '"');
      else if((notesFrom = notesFrom.split('')).length !== n)
                                         return Err('The "from" argument of a <' + type + '/> contains ' + notesFrom.split +
                                                    ' hints, but the preceding chord has ' + n + ' notes');
      else { for(i = 0;     i < notesFrom.length;     ++i)     if(notesFrom[i] === '.')   { --n;   It1.P[i]['noTieOut'] = true; }
             if((It1['numberNotesOut'] = n) === 0)
                                         return Err('A <' + type + '/> where ALL notes are excluded makes no sense');   }
    if(notesTo)
      if(!/^[\*\.]*$/.test(notesTo))     return Err('The "to" argument of a <' + type + '/> must be a sequence of "*" and "."; received "' + notesTo + '"');
      else It1['notesOfTieTo'] = notesTo;
      // we can't do more than that now because we don't have the destination chord yet
    if(directions) {
      if(!/^[ud\.]*$/.test(directions))  return Err('Direction hints of a ' + (type ? '<' + type + '/>' : 'tie/slur') +
                                                    ' must be a sequence of "u", "d", "."; received "' + directions + '"');
      else if((directions = directions.split('')).length !== n)
                                         return Err('Excpected ' + n + ' tie/slur d irection hints, but received ' + directions.length);
      else for(i = 0, n = 0;     i < It1.P.length;     ++i)
        if(!(p = It1.P[i]).noTieOut)   if(directions[n++] !== '.')   p['tieDirection'] = directions[n - 1];
    } else   for(i = 0;     i < It1.P.length;     ++i)     It1.P[i]['tieDirection'] = 'a'; // direction automatic
    if(type)   It1['tieOutType'] = type; // "tie" or "slur"; since it comes from a tagname no syntax check is required
    return mScore.noError;
  };

  if(curVoice.nBars === 0 && !curVoice.hasPickup)   curVoice.nBars = 1; // start with bar 1 if there's no anacrusis
  curBar = this.GetBar(curVoice.nBars);
  var Tok = this.Tokenizer;     Tok.prepare(source, 'Voice', false);
  while((T = Tok.takeType()))     switch((C = Tok.curItem), T) {
    case 'rp': // rhythm pattern switch
      if((C = +C.substring(1, C.length - 1)) === 0 || C > this.RhythmPatterns.length)
        return Err('Wrong rhythm pattern reference: Pattern ' + C + ' does not exist');
      (curVoice.curRhythm = this.RhythmPatterns[C - 1]).Reset();
      break;
    case 'cs': // color switch
      if((C = +C.substring(1, C.length - 1)) >= this.ColorStyles.length)
        return Err('Wrong color reference: Color ' + C + ' does not exist');
      curVoice.curColor = this.ColorStyles[C];
      break;
    case 'tp': // one-off tuplet or tuplet switch
      if((C = mScore.Tuplet.parse(C, false, curVoice.curRhythm.Values[curVoice.curRhythm.cur])).isError)     return Err();
      (curVoice.curRhythm = curVoice.singleNoteRhythm).SetTuplet(C); // explicit tuplet switches always end rhythm patterns and go to the single note pattern
      break;
    case 'nv': // note value switch
      if(!(T = mScore.Values[+(C = C.substring(0, C.length - 1))]))   return Err('"' + C + '" is not a valid note value');
      (curVoice.curRhythm = curVoice.singleNoteRhythm).SetValue(T);
      break;
    case 'tg': // converted xml tag for special commands
      if((C = Tok.parseTag(C)).isError)   return Err();
      switch(A = C.attributes,   C.nodeName) {
        case 's':
          
          break;
        case 'ocU':   curVoice.Octavate(+1);            break;
        case 'ocD':   curVoice.Octavate(-1);            break;
        case 'stA':   curVoice.stemDirection = 'a';     break;
        case 'stD':   curVoice.stemDirection = 'd';     break;
        case 'stU':   curVoice.stemDirection = 'u';     break;
        case 'stC':   curVoice.stemDirection = 'c';     break;
        case 'restPos':
          if((curVoice.restPos = argNum('val', true, 0)).isError)   return Err().Add('<restPos/>: ');
          break;
        case 'tacet':
          if((C = [ argNum('val', true, 0) ]).isError)                 return Err().Add('<tacet/>: ');
          if(C[0] < 0)                                                 return Err('<tacet/> values cannot be negative, obviously');
          if(!/^(?:yes|no)?$/.test(C[1] = arg('visible')))             return Err('<tacet/>: Attribute "visible" must be "yes" or "no"; received "'+C[1]+'"');
          C[1] = (C[1] !== 'no');
          while(C[0]-- > 0) {
            pushIt(new mScore.Rest(mScore.Values['1'], C[1], curVoice, curVoice.restPos));
            pushIt(curBar = this.GetBar(++curVoice.nBars));
            It2.isTacet = 2;
          }
          break;
        case 'key': // key signature change
          if((C = arg('val')) === '')   break; // no key signature change
          if(!curBar.key)     curBar['key'] = new Array(this.Staves.length);
          C = curBar.key[curVoice.curStave.idx - 1] = mScore.keyBase(C);
          if(typeof C !== 'number')                          return Err(); // error: no valid key signature
          break;
        case 'input': // marks the preceding item as a user input item
          if(It1.type !== 'C')                               return Err('Item marked as input must be a chord');
          It1.type = It1.type + 'I';
          if((C = new mScore.Note(arg('top'))).isError)      return Err('Attribute "top" of <input/> must be a pitch value; received "' + arg('top') + '"');
          It1['top'] = C.pitch;
          if((C = new mScore.Note(arg('bottom'))).isError)   return Err('Attribute "bottom" of <input/> must be a pitch value; received "' + arg('bottom') + '"');
          It1['bottom'] = C.pitch;
          It1.SetFix(false, true); // initially unfixed; also set the unfixed dummy note to the initial value
          break;
        case 'twoEndings':
          if(nextBar().twoEndings) {
            if(curBar.endingIdx !== 1 || curBar.twoEndings[0].firstBar !== curBar)
              return Err('different voices specify incompatible two-ending-repeats');
          } else (curBar['twoEndings'] = [{ firstBar: curBar,   lastBar: undefined }])['dy'] = -30;
          break;
        case '/twoEndings':     nextBar(undefined, true);     break;
        case 'stave':
          if((C = argNum('val', true, undefined)) === undefined)   break; // no value specified, don't change staves
          if(typeof C !== 'number')                                               return Err();
          if(C === 0 || C > this.Staves.length)                                   return Err('Illegal stave index ' + C + ' in stave switch');
          curVoice.curStave = this.Staves[C - 1];     break;
        case 'clef':
          if((C = arg('val')) === undefined || C === '')   break; // no value specified, don't change clefs
          if((C = new mScore.StaveClef(curVoice, C)).isError)                     return Err();
          curBar.Ch.push(C); // because clef changes can occur anywhere, we do not push it onto the shift register
          break; // clef of current stave is not changed now, because later voices may put notes before the clef change; deal with it in the layour phase
        case 'tie':   case 'slur':
          if(typeof (X = argNum('toVoice', true, curVoice.idx)) !== 'number')     return Err();
          if(addTie(X, arg('from'), arg('to'), arg('dir'), C.nodeName).isError)   return mScore.lastError;
          break;
        default:   return Err('Unknown XML element ' + Tok.curItem + ' encountered');
      }
      break;
    case 'rv': // visible rest
      restIsVisible = true;   // fall-through intentional
    case 'ri':
      if(C.substr(1, 1) === C.substr(0, 1)) { // full-bar rest---+
        // TODO!! Only after new bar
        //p = Tokenizer.cur;
        //if(!Tokenizer.getToken() || (Tok.type === 'sp' && !Tokenizer.getToken()) || Tok.type !== 'bl') // look ahead; I know this is slightly unsound
        //  return Err('Expected some sort of bar line right after a full bar rest, but got "' + Tok.token + '"');
        //Tokenizer.cur = p; // give back the premature token(s)
        // full-bar rests and (both ** and <tacet>) are displayed as full-note rests even when their actual value is different
        pushIt(new mScore.Rest(mScore.Values['1'], restIsVisible, curVoice, curVoice.restPos)).isTacet = 1;
        curVoice.curRhythm.Reset(); // restart current rhythm pattern
      } else { // regular rest
        if(restIsVisible && It1.type === 'BG')   return Err('A rest within a beamed group can only be invisible (for voice interlacing)');
        T = (It1.type === 'BG' ? It2 : It1); // the last ACTUAL element, which may contain dots
        pushIt(new mScore.Rest(null, restIsVisible, curVoice, curVoice.restPos)); // TODO!!
        if(It2.type === 'BG')   It2.lastCh = It1;
        curVoice.curRhythm.ApplyAndAdvance(It1); // set the rest's value using the current rhythm pattern (including the previous chord's dots)
        if((C = C.substring(1)) !== '')   It1.yOffset += (+C);
      }
      if(!curVoice.curColor.isDefault)   It1['ColorStyle'] = curVoice.curColor;
      It1.Bar = curBar;     curBar.Ch.push(It1);     restIsVisible = false;     break;
    case 'b_': // beam connector
      if(It1.type !== 'C' && !(It1.type === 'R' && !It1.visible))
        return Err('A beamed group connection "_" can only come after a chord or an invisible rest');
      if(It2.type === 'BG')     pushIt(It2); // beamed group already there, this adds another connection
      else {
        curVoice.BG.push(pushIt(new mScore.BeamedGroup()));
        if(It2.type === 'C')   It1.add(It2); // add the first chord to the beamed group's chord list (NOT with invisible rests)
      }
      It2['BG'] = It1;
      if(C.length > 1)   It2['beamCutAfter'] = C.length - 2;     break;
    case 'bl': // some sort of bar line
      nextBar(mScore.barlines[C]);     break;
    case 'vc': // voice switch in multivoice environment
      if(cycleVoice(false, C.length).isError)   return Err();
      break;
    case 'ch': // Chord
      if(It1.type === 'C' && curVoice.curRhythm.beamInNow())
        if(It1.BG)   pushIt(It1.BG); // beamed group already there, this adds another connection
        else {
          curVoice.BG.push(pushIt(new mScore.BeamedGroup()));
          It1.add(It2); // add the first chord to the beamed group's chord list (NOT with invisible rests)
        }
      if(pushIt(mScore.Chord.parse(C, curVoice, curVoice.stemDirection)).isError)   return Err();
      It1.Bar   = curBar;
      It1.Stave = curVoice.curStave.curClef;
      if(curVoice.curRhythm.ApplyAndAdvance(It1).isError) // set the chord's note value information using the current rhythm pattern (including the previous chord's dots)
        return Err(); // error if there were too many dots, so the note gets too short
      It1.ColorStyle = curVoice.curColor;
      if(It2.type === 'BG')   It2.add(It1);
      curBar.Ch.push(It1);
      break;
    case 'ti': // tie/slur
      if(It1.type !== 'C')   return Err('A tie can only be between two chords' + (It1.type === 'b_' ? ' which are not connected by a beam' : ''));
      C = C.match(tieSplit);     X = curVoice.idx;
      if(C && testInt.test(C[0]))   { X = +C[0];   C.shift(); } // drop first array element; the rest of it are tie curve direction hints
      if(addTie(X, undefined, undefined, (C && C.length > 0 ? C[0] : undefined)).isError)   return mScore.lastError;
      break;
    case 'mc': // macro call
      if(Tok.applyMacro(this.Macros).isError)   return Err();     break;
    case 'ma': // macro argument (appears while applying a macro)
      Tok.applyMacroArgument();     break;
    case 'nn': // error, unknown token
      return Err('Cannot understand the item "' + C + '", sorry!');
  }
  if(cycleVoice(true).isError)   return Err();
  return mScore.noError;
};
