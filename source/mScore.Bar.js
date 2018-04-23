/* global mScore */

﻿/**********************************************************************************************************************/
/**                                                  Data type: bar                                                  **/
/**********************************************************************************************************************/

mScore.Bar = function(Piece) {
  this.Piece        = Piece;
  this.x            = 0;
  this.tAt          = 0; // time where this bar line happens
  this.Ch           = [ ]; // bar content, all voices together
  this.tLen         = 0;
  this.width        = 0;
  this.widthNatural = 0;
  this.Line         = null;
  this.idx          = undefined;
  this.style        = undefined; // type of the bar line at the beginning of the bar; see enumeration mScore.Voice.barlines
  // this.key             //
  // this.TimeSignature   // added when needed
  // this.twoEndings      //
  // this.endingIdx       //
};

mScore.Bar.prototype['type'] = 'B';

mScore.Bar.prototype['tVal'] = function() { return 0; };


mScore.Bar.prototype['boundingBox'] = function(BarSelector) {
  var iLine = this.Line.idx - 1, Pi = this.Line.Piece,
      E = { yDomain: 0,                                            hDomain: 0,
            xDomain: this.x + this.Line.Piece.drawingOffset.x,     wDomain: this.width,
            yRefStave: this.Line.yRef + this.Line.Piece.drawingOffset.y                   };
  if(iLine)                         E.yDomain = Pi.Lines[iLine - 1].yBottom + Pi.drawingOffset.y;
  else                              E.yDomain = BarSelector.yCutoff[0] || 0;
  if(iLine < Pi.Lines.length - 1)   E.hDomain = Pi.Lines[iLine + 1].yTop + Pi.drawingOffset.y;
  else                              E.hDomain = BarSelector.yCutoff[1] || BarSelector.CT.canvas.height;
  E.hDomain = Math.max(E.hDomain - E.yDomain, 0);
  return E;
};


(function(sortBarItems) { /** Not redo-safe! Assumes that items were previously ordered by voice, secondarily by time **/
  mScore.Bar.prototype['LayoutTimes'] = function() {
    var It = this.Ch, tAt, CurVoice, i = 0, C, hasTacet = false;
    if(It.length === 0)   return;
    while(It[i]) {
      if(It[i].isTacet)   { hasTacet = true;     ++i;     continue; }
      for(CurVoice = It[i].Voice, tAt = 0;   (C = It[i]) && C.Voice === CurVoice;     ++i)
        { C.tAt = tAt;     tAt += C.value.tValDots(C.nDots, C.Tuplet); }
      if(tAt > this.tLen)   this.tLen = tAt;
    }
    It.sort(sortBarItems); // sort items by time, secondarily by stave
    if(hasTacet) // it's possible a different rest than a full note rest is a better choice for the full-bar rest
      for(i = 0, C = mScore.Values.bestTacet(this.tLen);     i < It.length;     ++i)     if(It[i].isTacet)     It[i].value = C;
  };
})(function(a, b) { return (a.tAt - b.tAt) || (a.Stave.sortIdx - b.Stave.sortIdx); });


(function(mergePutIn, mergeProcess) { mScore.Bar.prototype['Layout'] = function(Renderer, width) {
  var Sp = Renderer.Spaces, Ch = this.Ch, i, i2, ie = Ch.length, ie2, C, x, tAt = 0, offsL, offsR, xFactor = 1, accs = { }, mergers = { }, P, curTuplet;
  if(Ch.length === 0)   return mScore.noError;

  // collect all items that belong to the same merge groups; is redo-safe
  for(i = 0;     i < ie;     ++i) {
    if(typeof (C = Ch[i]).mergeGroup !== 'number')   continue; // item has no merge group or is part of an already appended beamed group
    if(!(x = mergers[C.mergeGroup]) || x.tAtEnd < C.tAt) { // previous merge group of same index has ended or there hasn't been one in this bar yet
      if(x)   if((x = mergeProcess.call(x)).isError)     return x.Prefix('', this);
      x = mergers[C.mergeGroup] = { idx: C.mergeGroup,   Ch: [ ],   tAtEnd: C.tAt };
    }
    if(C.BG)   x.tAtEnd = Math.max(x.tAtEnd, C.BG.lastCh.tAt); // update end time of the merge group
    mergePutIn(x.Ch, C);     C.mergeGroup = x;
  }
  for(x in mergers)   if((x = mergeProcess.call(mergers[x])).isError)     return x.Prefix('', this);

  // vertically layout items seperately; beamed groups too, except for their beam slope, which requires the horizontal positions first
  // also correctly collect tuplets
  if(width !== undefined)   xFactor = width / this.widthNatural;
  for(i = 0;     i < ie;     ++i) {
    /*if((C = Ch[i]).Tuplet && C === C.Tuplet.It[0]) {
      if(C.BG && C === C.BG.Ch[0] && C.BG.Ch[C.BG.Ch.length - 1] === C.Tuplet.lastItem) // is the tuplet congruent with a single beamed group?
        C.Tuplet['singleBG'] = C.BG;
    }*/
    switch((C = Ch[i]).type) {
      case 'C'    : C.Layout(Renderer);                                        break;
      case 'CI'   : C.Layout(Renderer);
                    if(!C.fixed)     C.Colorstyle = Renderer.inputColor;       break;
      case 'R'    : C.y = C.Stave.Stave.y - C.yOffset * Renderer.halfLine;     break;
      case 'clef' : Renderer.requestAdditionalSprite('C' + C.clef + 's'); // load small clef sprite if it hasn't already
                    if(!this.ClefChanges)   this['ClefChanges'] = [ C ];
                    else                    this.ClefChanges.push(C);          break;
    }
  }
  for(i = i2 = 0, x = Sp.barIn - Sp.betweenChords;     i < ie; ) {
    for(offsL = offsR = 0;     i < ie && (C = Ch[i]).type === 'clef';     ++i)
      { P     = Renderer.Sprites['C' + C.clef];
        C.x   = Math.round((x + 10 - (P.CA.x>>1)) * xFactor);
        offsR = Math.max(offsR, 10 + (P.CA.x>>1) + 7);          }
    x += offsR;     tAt = C.tAt;     offsR = 0;     i2 = i;
    for(;     i < ie && (C = Ch[i]).tAt === tAt;     ++i)
      if(C.type === 'C' || C.type === 'CI') { if(C.leftOutcrop  > offsL)   offsL = C.leftOutcrop;
                                              if(C.rightOutcrop > offsR)   offsR = C.rightOutcrop; }
    if(i2 < i)  { x += offsL + Sp.betweenChords;
                  while(i2 < i)     if((C = Ch[i2++]).type !== 'clef')   C.x = Math.round(x * xFactor);
                  x += offsR;                                                                             }
  }
  this.width = width || (this.widthNatural = x + Sp.barOut);

  // find optimal beam slope and set inherited accidentals
  for(i = 0;     i < ie;     ++i)     switch((C = Ch[i]).type) {
    case 'R':
      if(C.isTacet)     C.x = (this.width >> 1); // position full-bar rests in the middle of the bar
      break;
    case 'C': case 'CI':
      if(C.typeBG === 'L')   C.BG.FindOptimumBeamSlope(Renderer);
      for(i2 = 0, C = C.P;     i2 < C.length;     ++i2) {
        if(accs[(x = C[i2]).pitch] !== undefined)     x['accInherited'] = accs[x.pitch];
        else     if(x.accInherited !== undefined)     x.accInherited    = undefined;
        if(x.acc                   !== undefined)     accs[x.pitch]     = x.acc;
      }
      break;
  }
  for(i = 0;     i < ie;     ++i) // tuplets nested inside this one are dealt with recursively by *C.Tuplet.Layout()*
    if((P = (C = Ch[i]).Tuplet) && P.Tuplet.style !== 'n' && C === P.It[0])   P.Layout(Renderer);
  return mScore.noError;
};
var Err = function(msg) { return new mScore.Error(msg, undefined); };
})(/* mergePutIn */ function(Ch, C) { 
  var iw = Ch.length - 1, tAt = C.tAt;
  while(iw >= 0 && tAt < Ch[iw].tAt)     Ch[iw + 1] = Ch[iw--];
  Ch[iw + 1] = C;
}, /* mergeProcess */ function() {
  var Ch = this.Ch, C0 = this.Ch[0], C, Cnew, i, ie = this.Ch.length, tAt, tVal = C0.value.tValDots(C0.nDots, C0.Tuplet), Stave = C0.Stave.Stave, t, j, BG = [ ];
  if(C0.type === 'R') { // merge rests at the same time position. The only way rests can be merged, except for invisible rests in beamed groups
    C0.mergeGroup = C0;
    for((i = 1, tAt = C0.tAt), t = C0.visible;     i < ie;     ++i) {
      if((C = Ch[i]).tAt !== tAt || C.value.tValDots(C.nDots, C.Tuplet) !== tVal || t !== C.visible)
        return Err('Rests can be merged, but only with other rests of the same type and length');
      if(C.Stave.Stave !== Stave)   return Err('Rests can be merged, but not across different staves');
      C.mergeGroup = C0;     C.type = 'M' + C.type;
    }
    return mScore.noError;
  }
  for(i = 0;     i < ie;     ++i) {
    if((C = Ch[i]).type === 'R' && (C.visible || !C.BG))
      return Err('Rests can be merged, but only with other rests of the same type and length');
    if(tAt !== (tAt = C.tAt)) { // start a new chord
      if(Cnew)   BG.push(Cnew);
      Cnew = mScore.Chord.fromItem(C, true);
    } else
      if((Cnew = Cnew.mergeIn(C)).isError)   return Cnew;
  }
  ie = BG.push(Cnew);
  if(ie > 1)   { C = new mScore.BeamedGroup();     for(i = 0;     i < ie;     ++i)     C.add(BG[i]);
                 if(C.setBeamNumbers().isError)     return mScore.lastError; }
  
  var k = -1, Bar = C0.Bar;
  for((i = 0, tAt = undefined), (ie = Ch.length, j = -1);     i < ie;     ++i) {
    if(tAt !== (tAt = (C = Ch[i]).tAt)) {
      while(Bar.Ch[++k] !== C); // find the item in the bar, we need its array index
      (Bar.Ch[k] = BG[++j]).mergeGroup = C; // the first item of each time position gets replaced by the corresponding one from the the merged group
    } else   C.type = 'M' + C.type; // comment out the item, in a way
    C.mergeGroup = BG[j]; // original chords' *mergeGroup*s are the respective merged chords
  }
  
  return mScore.noError;
});


mScore.Bar.prototype['drawClipped'] = function(Selector) {
  var CT = Selector.CTtemp, R = Selector.Renderer, B = this.Piece.Bars, BB = Selector.BB, w = BB.wDomain, h = BB.hDomain, dy = Selector.drawingOffset.y;
  CT.clearRect(0, 0, w, h);
  CT.drawImage(Selector.CTBar.canvas, 0, 0, w, h, 0, 0, w, h);
  this.Line.drawStaves(CT, R, 0, dy, w);
  dy += this.Line.yRef;
  /*if(this.twoEndings && (BB = this.twoEndings[this.endingIdx - 1]).firstBar !== this && this.Line.beginBar !== this.idx)
    R.twoPartRepeat(CT, -this.x, dy, B[Math.max(BB.firstBar.idx,     this.Line.beginBar)],
                                            B[Math.min(BB.lastBar .idx + 1, this.Line.endBar)], this.endingIdx);*/
  this.draw(CT, R, -this.x, dy, true);
};


mScore.Bar.prototype['draw'] = function(CT, Renderer, dx, dy, croppedSingle) {
  var Ch = this.Ch, i = 0, ie = Ch.length, C, x, P;
  if(this.twoEndings && ((P = this.twoEndings[this.endingIdx - 1]).firstBar === this || this.Line.beginBar === this.idx))
    Renderer.twoPartRepeat(CT, dx, dy, this, this.Piece.Bars[Math.min(P.lastBar.idx + 1, this.Line.endBar)], this.endingIdx);
  dx += this.x;
  for(i = 0;     i < ie;     ++i) {
    switch((C = Ch[i]).type) {
      case 'C': // chord
        if(C.tieTo)     Renderer.drawTie(CT, dx - this.x, dy, C, true,  this.Line);
        if(C.tieFrom)   Renderer.drawTie(CT, dx - this.x, dy, C, false, this.Line, croppedSingle);
        switch(C.typeBG) {
          case 'L':   Renderer.drawBeamedGroup(CT, C.BG, dx, dy);     break;
          case 'R':   break; // not-first chord of beamed group; Renderer.drawBeamedGroup takes care of them
          default:    Renderer.drawSingleChord(CT, C, dx, dy);
        }
        break;
      case 'R': // rest
        if(C.visible)   Renderer.Sprites['R' + C.value.val].draw(CT, C.x + dx, C.y + dy, C.ColorStyle);
        break;
      case 'CI':
        CT.beginPath();
        mScore.drawSpritePath.call(CT, 'Trs' + dx + ' ' + dy + Renderer.Const.InputMarker.shape, C);
        CT.fillStyle = Renderer.Const.InputMarker.fillStyle;     CT.fill();
        Renderer.drawSingleChord(CT, C, dx, dy);
        break;
      case 'clef':
        CT.drawImage((P = Renderer.Sprites2['C' + C.clef + 's']).CA, dx + C.x, dy + C.Stave.y + P.Ref.y);
        break;
    }
    if(C.Tuplet && C.Tuplet.Tuplet.style !== 'n' && C === C.Tuplet.It[0])   Renderer.drawTupletBracket(CT, dx, dy, C.Tuplet);
  }
};


mScore.Bar.prototype['toString'] = function() { return this.idx !== 0 ? 'bar no.' + this.idx : 'anacrusis'; };