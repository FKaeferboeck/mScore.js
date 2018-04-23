/* global mScore */

/**********************************************************************************************************************/
/**                                                Data type: Line                                                   **/
/**********************************************************************************************************************/

mScore['Line'] = function(Piece, Renderer, prevLine, lineWidth, yRef) {
  this.Piece            = Piece;
  this.idx              = undefined; // to be set in Piece.newLine(...)
  this.beginBar         = (prevLine ? prevLine.endBar : Piece.startBar);
  this.endBar           = undefined;
  this.lineWidth        = lineWidth;
  this.lineWidthContent = 0;
  this.lineWidthNominal = lineWidth;
  this.yRef             = yRef;
  this.yTop             = yRef; //
  this.yBottom          = yRef; // to be set in Line.SetHeights(...)
  this.yCenter          = yRef; //
  this.Staves           = [ ];
  this.Clefs            = new Array(Piece.Staves);

  var St = Renderer.Sprites.St, i, ie, j, je, Bar = Piece.Bars, B;
  this.yTop    = this.yRef + St.Ref.y; // top edge of the topmost stave
  this.yBottom = this.yTop + Piece.Staves[Piece.Staves.length - 1].y + St.CA.height;
  this.yCenter = (this.yTop + this.yBottom) >> 1;
  St = (prevLine ? prevLine.Staves : Piece.Staves);
  for(i = 0, ie = St.length;     i < ie;     ++i) {
    this.Clefs[i] = Piece.Staves[i].curClef;
    this.Staves[i] = { clef: (B = St[i]).clef,   key: B.key,   y: B.y }; // TODO!! Is that gratuitious now?
  }
  if(prevLine)     for(j = prevLine.beginBar, je = prevLine.endBar;     j < je;     ++j) {
    if((B = Bar[j].key))     for(i = 0;     i < ie;     ++i)
      if(B[i] !== undefined)     this.Staves[i].key = B[i] || undefined;
  }
  ie = Bar.length;
  this.endBar = this.beginBar;
  var w = ((B = Bar[this.endBar++]).x = this.interBarSpace(Renderer, B, 1)) + B.widthNatural, w1 = w; // head plus first bar
  while(this.endBar < ie &&     // add bars plus space from preceding bars until line is filled
        (w1 = ((B = Bar[this.endBar]).x = w + this.interBarSpace(Renderer, B, 0)) + B.widthNatural) < lineWidth)
    { ++this.endBar;     B.Line = this;     w = w1; }
  if(this.endBar < ie) // if the piece is not at its end, add the end-of-line barline stuff
    if((w1 = w + this.interBarSpace(Renderer, B, 2)) > lineWidth && this.endBar - this.beginBar > 1)
      // end-of-line stuff makes the content too long ——> drop a bar
      w = w - (B = Bar[--this.endBar]).widthNatural - this.interBarSpace(Renderer, B, 0) + this.interBarSpace(Renderer, B, 2);
    else   w = w1;
  this.lineWidthContent = this.lineWidthNatural = w;
  for(i = this.beginBar;     i < this.endBar;     ++i)
    if((B = Bar[i].ClefChanges))
      for(j = 0;     j < B.length;     ++j)     B[j].Stave.curClef = B[j]; // apply clef changes
};

        
(function() {
  var startLineBar = { 'eb': true, 'b': true };

/* calculates space between *Bar* and the previous bar.                              */
/* position = 0     both bar in the same line                                        */
/* position = 1     head width of line when *Bar* is the first bar of the line       */
/* position = 2     space at end of line when *Bar* already falls into the next line */
mScore.Line.prototype['interBarSpace'] = function(Renderer, Bar, position) {
  var w = 0, BL, St = this.Staves;
  switch(position) {
    case 0:
      w = (BL = Renderer.Sprites['BL' + Bar.style]).totalWidth;
      if(Bar.key)     w += Renderer.keyWidth(Bar.key);
      if(Bar.TimeSignature)   w = Renderer.drawTimeSignature(null, St, w += Renderer.Spaces.beforeTime, 0, Bar.TimeSignature);
      break;
    case 1:
      w = Renderer.drawClefs(undefined, this.Clefs, w);
      if(startLineBar[Bar.style])     w += Renderer.Sprites.BLb.totalWidth + Renderer.Spaces.beforeHeadBarline;
      w += Renderer.keyWidth((startLineBar[Bar.style] && Bar.key) || St);
      if(Bar.TimeSignature)   w = Renderer.drawTimeSignature(null, St, w += Renderer.Spaces.beforeTime, 0, Bar.TimeSignature);
      break;
    case 2:
      return Renderer.Sprites['BL' + (Bar.style === 'eb' ? 'e' : Bar.style)].totalWidth;
  }
  return w;
};

mScore.Line.prototype['drawInterBar'] = function(CT, Renderer, dx, dy, Bar, BarPrev, position) {
  var St = this.Staves, t, x;
  dy += this.yRef;
  switch(position) {
    case 0:
      x = Renderer.drawBarLine(CT, this.Piece, dx += BarPrev.x + BarPrev.width, dy, Bar.style, position);
      if(Bar.key)     x = Renderer.drawKey(CT, St, x, dy, Bar.key);
      if(Bar.TimeSignature)     Renderer.drawTimeSignature(CT, St, x += Renderer.Spaces.beforeTime, dy, Bar.TimeSignature);
      break;
    case 1:
      if(this.Staves.length > 1)
        Renderer.drawBarLine(CT, this.Piece, dx, dy, '1', position); // TODO!! bracket
      dx = Renderer.drawClefs(CT, this.Clefs, dx, dy);
      if(startLineBar[Bar.style]) {
        if(!Bar.key)     dx = Renderer.drawKey(CT, St, dx, dy);
        dx = Renderer.drawBarLine(CT, this.Piece, dx + Renderer.Spaces.beforeHeadBarline, dy, 'b', position);
        if(Bar.key)      dx = Renderer.drawKey(CT, St, dx, dy, Bar.key);
      } else             dx = Renderer.drawKey(CT, St, dx, dy, Bar.key);
      if(Bar.TimeSignature)     Renderer.drawTimeSignature(CT, St, dx += Renderer.Spaces.beforeTime, dy, Bar.TimeSignature);
      break;
    case 2:
      if((t = Bar.style) === 'eb')     t = 'e';
      Renderer.drawBarLine(CT, this.Piece, dx += BarPrev.x + BarPrev.width, dy, t, position);
      break;
  }
};
})();


// Caution: Only call ONCE per line! Does not do previous resetting.
mScore.Line.prototype['HorizontalAlign'] = function(Renderer, alignment) {
  var xDefect = this.lineWidth - this.lineWidthContent, i, ie, Bars = this.Piece.Bars, B, t = 0, w = 0, dt = 0;
  this.lineWidth = this.lineWidthNominal;
  switch(alignment) {
    case 'left':         return; // nothing to do
    case 'leftJagged':   this.lineWidth = this.lineWidthContent;     return;
    case 'center':       xDefect >>= 1; // deliberate fall-through
    case 'right':
      for(i = this.beginBar;   i < this.endBar;   ++i)     Bars[i].x += xDefect;
      return;
    case 'justify':
      if(this.beginBar === this.endBar)   return;
      for(i = this.beginBar, ie = this.endBar;     i < ie;     ++i)     w += Bars[i].widthNatural;
      for(i = this.beginBar, xDefect += w;     i < ie;     ++i) {
        (B = Bars[i]).x += dt;
        B.Layout(Renderer, Math.round(-(t + dt) + ((t += B.widthNatural) / w) * xDefect ));
        dt += B.width - B.widthNatural;
      }
  }
};


mScore.Line.prototype['drawStaves'] = function(CT, Renderer, dx, dy, width)
  { var i = 0;     width = width || this.lineWidth;     dy += this.yRef;
    do   Renderer.drawSingleStave(CT, dx, dy + this.Piece.Staves[i].y, width);   while(++i < this.Piece.Staves.length);   };


mScore.Line.prototype['draw'] = function(CT, Renderer, dx, dy) {
  var Bars = this.Piece.Bars, i = this.beginBar, B = Bars[i];
  this.drawStaves(CT, Renderer, dx, dy);
  this.drawInterBar(CT, Renderer, dx, dy, B, null, 1); // draws the line head
  B.draw(CT, Renderer, dx, dy + this.yRef);
  while(++i < this.endBar) {
    this.drawInterBar(CT, Renderer, dx, dy, B = Bars[i], Bars[i - 1], 0); // draw between-bars stuff (barlines, key changes etc.)
    B.draw(CT, Renderer, dx, dy + this.yRef);
  }
  if(this.endBar < Bars.length)     this.drawInterBar(CT, Renderer, dx, dy, Bars[this.endBar], Bars[this.endBar - 1], 2);
};

mScore.Line.prototype['toString'] = function() { return 'line ' + this.idx; };