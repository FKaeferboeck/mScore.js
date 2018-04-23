/* global mScore */

/**************************************************************************************************************************************************************/
/**                                                                Minimum-where helper class                                                                **/
/**************************************************************************************************************************************************************/

// Pseudo-constructor for function object (showing off, to be honest)
mScore.MinWhere = function() {
  var fct = function(val, idx) {
    if(!(val >= fct.min))   { fct.min = val;   fct.minIdx = idx; }
    return fct;
  };
  fct['reset'] = function() { this.min = this.minIdx = undefined;     return this; };
  return fct;
};

﻿/**************************************************************************************************************************************************************/
/**                                                                     Data type: Bar                                                                       **/
/**************************************************************************************************************************************************************/

mScore.Bar.prototype['findEverything'] = function(Renderer, MinWhere, x, y) {
  var Ch = this.Ch, C, P, i = 0, ie = Ch.length, j, t, p;
  while(i < ie)   switch((C = Ch[i++]).type) {
    case 'C':
      for(P = C.P, j = 0;     j < P.length;     ++j)
        MinWhere(( (t = (p = P[j]).y - y) * t +
                   (t = C.x + (p.noteOut ? Renderer.Spaces.noteOutRefShift[p.noteOut] : 0) - x) * t) / 150,
                 [this, C, j]);
      break;
    case 'R':
      MinWhere(Renderer.Sprites['R' + C.value.val].boxDistance(x - C.x, y - C.y), [this, C, 0]);
      break;
    case 'CI':
      MinWhere((t = C.x - x) * t / 800, [this, C, 0]);
      break;
  }
};

﻿/**************************************************************************************************************************************************************/
/**                                                                   Data type: Selector                                                                    **/
/**************************************************************************************************************************************************************/

mScore.BarSelector = function(Renderer, CanvasContext) {
  this.Piece         = null;
  this.Renderer      = Renderer;
  this.CT            = CanvasContext;
  this.CTBar         = document.createElement('CANVAS').getContext('2d');
  this.CTtemp        = document.createElement('CANVAS').getContext('2d');
  this.CToriginal    = document.createElement('CANVAS').getContext('2d');
  this.CToriginal.globalCompositeOperation = 'copy';
  this.Bar           = null;
  this.Item          = null;
  this.subItemIdx    = 0;
  this.isDragging    = false;
  this.dragStartPos  = new mScore.P2d(0, 0);
  this.onlyDragWhereAllowed = false;
  this.drawingOffset = new mScore.P2d(0, 0);
  this.Mini          =     mScore.MinWhere();    // using a pseudo-constructor
  this.bgColorSelect = undefined;                // fill style for the background of selected bars
  this.yCutoff       = [ undefined, undefined ]; // y coordinates where the first bar begins and the last bar ends
  this.BB            = undefined;                // will hold the selected bar's bounding box
};


// Returns an array of references to the Bars this mouse position is in (can be empty, 1 or 2 bars, because lines overlap)
mScore.BarSelector.prototype['findBars'] = function(xMouse, yMouse) {
  var Piece = this.Piece, i, PL = Piece.Lines, L = [ ], E = [ ];
  xMouse -= (i = Piece.drawingOffset).x;     yMouse -= i.y;
  // identify the line
  if(yMouse > this.yCutoff[0] || yMouse < this.yCutoff[1])   return E; // not inside a line, thus no bar
  for(i = 0;     i < PL.length - 1;     ++i)     if(yMouse < PL[i + 1].yTop)
    { if(yMouse > (L[0] = PL[i]).yBottom)   L[1] = PL[i + 1];     break;   }
  if(L.length === 0)   L[0] = PL[i]; // last line, this will also apply if there is only one line
  
  L.forEach(function(L) { // identify the bar within the line
    for(var i = L.beginBar, B;     i < L.endBar;     ++i)     if(xMouse >= (B = Piece.Bars[i]).x && xMouse - B.x <= B.width)   { E.push(B);     break; }
  });
  return E;
};


mScore.BarSelector.prototype['selectItem'] = function(Bar, Item, subItemIdx) {
  if(!Bar && !this.Bar)   return false; // nothing selected before, nothing selected now
  if(this.Item !== Item || this.subItemIdx !== subItemIdx)   this.isDragging = false; // just in case
  if(this.Item && !Item && this.Item.type === 'CI' && !this.Item.fixed)
    this.Item.SetNote(this.Renderer, 'pitch', this.Item.NoteUnfixed); // let unfixed input item snap back to default position
  this.Item       = Item;
  this.subItemIdx = subItemIdx;
  var Pi = this.Piece, CTBar = this.CTBar;
  if(Bar !== this.Bar) {
    if(this.Bar)   this.drawBar(false); // draws the original bar back without background (i.e. release it)
    if(!(this.Bar = Bar))   return true;
    var BB = this.BB = Bar.boundingBox(this), w, h;
    this.CToriginal.canvas.width  = this.CTtemp.canvas.width  = CTBar.canvas.width  = w = BB.wDomain;
    this.CToriginal.canvas.height = this.CTtemp.canvas.height = CTBar.canvas.height = h = BB.hDomain;
    this.CToriginal.drawImage(CT.canvas,     BB.xDomain, BB.yDomain, w, h,     0, 0, w, h);
    var dx = Pi.drawingOffset.x - BB.xDomain, dy = Pi.drawingOffset.y - BB.yDomain, iL = Bar.Line.idx;
    if(iL > 1)                 Pi.Lines[iL - 2].draw(CTBar, this.Renderer, dx, dy); // does some superfluous drawing of bars outside the
    if(iL < Pi.Lines.length)   Pi.Lines[iL]    .draw(CTBar, this.Renderer, dx, dy); // cropped canvas, but never mind, it keeps the code simple
    this.drawingOffset.Set(Pi.drawingOffset).Sub(BB.xDomain, BB.yDomain); // drawing offset in the temporary bar canvas
  }
  this.drawBar(true);     return true;
};


mScore.BarSelector.prototype['drawBar'] = function(useBG) {
  var SaveColor1, SaveColor2, It = this.Item, ItSub, CT = this.CT, BB = this.BB, CTtemp = this.CTtemp, w = BB.wDomain, h = BB.hDomain;
  if(It) {
    SaveColor1 = It.ColorStyle;
    if(It.type === 'C') {
      SaveColor2 = (ItSub = It.P[this.subItemIdx]).ColorStyle;
      It.ColorStyle      = this.Renderer.highlightColor[It.P.length > 1 ? 0 : 1];
      ItSub.ColorStyle   = this.Renderer.highlightColor[this.isDragging ? 2 : 1];
    } else It.ColorStyle = this.Renderer.highlightColor[this.isDragging ? 2 : 1];
    this.Bar.drawClipped(this);
    It.ColorStyle = SaveColor1;
    if(ItSub)   ItSub.ColorStyle = SaveColor2;
  } else CTtemp = this.CToriginal;
  if(useBG && this.bgColorSelect)
    { CT.fillStyle = this.bgColorSelect;     CT. fillRect(BB.xDomain, BB.yDomain, w, h);     CT.fillStyle = 'black'; }
  else                                       CT.clearRect(BB.xDomain, BB.yDomain, w, h);
  CT.drawImage(CTtemp.canvas,     0, 0, w, h,     BB.xDomain, BB.yDomain, w, h);
};


// uses a callback function to find the closest item from an array of Bars.
// the callback receives a MinWhere object for the result and Bar-local coordinates
mScore.BarSelector.prototype['findThingInBars'] = function(Bars, perBarCallback, xPos, yPos) {
  if(!Bars.length)   return [ undefined, undefined, undefined ]; // just in case
  var Bar, i, M = this.Mini.reset(), x, y, C;
  xPos -= this.Piece.drawingOffset.x;     yPos -= this.Piece.drawingOffset.y;
  for(i = 0;     i < Bars.length;     ++i)     perBarCallback.call((Bar = Bars[i]), this.Renderer, M, xPos - Bar.x, yPos - Bar.Line.yRef);
  if(M.min <= 1)          return M.minIdx;
  if(Bars.length === 1)   return [ Bars[0], undefined, undefined ];
  for(M.reset(), i = 0;     i < Bars.length;     ++i)     M(Math.abs(yPos - Bars[i].Line.yCenter), Bars[i]);
  return [ M.minIdx, undefined, undefined ];
};


mScore.BarSelector.prototype['mouseTo'] = function(x, y) {
  var It = this.Item, Bar = this.Bar, St = It.Stave;
  if(!It)   return false;
  y -= Bar.Line.Piece.drawingOffset.y + Bar.Line.yRef + St.Stave.y;
  this.subItemIdx = It.SetNote(this.Renderer,   'pitch',   St.magic[0] - Math.round(y / this.Renderer.halfLine),   this.subItemIdx);
  It.Layout(this.Renderer);
  if(It.BG)   It.BG.FindOptimumBeamSlope();
};


mScore.BarSelector.prototype['mouseUp'] = function(x, y) {
  var It = this.Item;
  if(!It)   return false;
  this.mouseTo(It, x, y);
  switch(It.type) {
    case 'CI':
      It.type = 'C';
      It.ColorStyle = It.ColorStyleFixed;
      break;
  }
  this.Item = null;
  return true;
};


mScore.Renderer.prototype['createAccidentalControls'] = function(accDiv, hotKeyList, SetAccidentalCallback) {
  var Buttons = [ ], B, ButtonFinder = { }, C;
  var symbolSize = 8 / this.line;
  var clicker = function(Event) {
    var acc = +Event.target.accidental;
    accDiv.SetButton(acc);
    if(SetAccidentalCallback)     SetAccidentalCallback(acc);
  };
  
  for(var i = 0;     i < 3;     ++i) {
    B = Buttons[i] = document.createElement('BUTTON');
    ButtonFinder[B['accidental'] = i - 1] = B;
    B.onmousedown = clicker;
    switch(B.accidental) {
      case -1:
        B.appendChild(C = this.Const.Accidental.Flat.createSprite('Ctrl_b', this, symbolSize).CA);
        C.onmousedown = clicker;     C.accidental = B.accidental;     break;
      case 0:
        B.appendChild(document.createTextNode('('));
        B.appendChild(C = this.Const.Accidental.Natural.createSprite('Ctrl_0', this, symbolSize).CA);
        B.appendChild(document.createTextNode(')'));
        B.className = 'pressed';
        C.onmousedown = clicker;     C.accidental = B.accidental;     break;
      case 1:
        B.appendChild(C = this.Const.Accidental.Sharp.createSprite('Ctrl_#', this, symbolSize).CA);
        C.onmousedown = clicker;     C.accidental = B.accidental;     break;
    }
    accDiv.appendChild(B);
  }

  accDiv['SetButton'] = function(accidental) // does not operate the callback
    { for(var i = 0, p;     i < Buttons.length;     ++i)
        (p = Buttons[i]).className = (p.accidental === accidental ? 'pressed' : '');   };
  
  if(hotKeyList) {
    var onkeydownOld = document.onkeydown;
    document.onkeydown = function(Event) { var acc = hotKeyList[Event.key];
                                           if(acc !== undefined)     clicker({ target: ButtonFinder[acc] });
                                           if(onkeydownOld)     onkeydownOld(Event);                           };
  }
};
