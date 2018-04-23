/* global mScore */

/**************************************************************************************************************************************************************/
/**                                                                Stuff for parsing XML input                                                               **/
/**************************************************************************************************************************************************************/

/** augmented replacement for DOMParser.parseFromString; it adds the literal versions of the XML element tags to the tree structure. **/
(function() {
  mScore['parseXML'] = function(content) {
    content = content.replace(/&/g, '&amp;'); // suppress character entity replacment
    var XML = Parser.parseFromString(content, 'text/xml'),   Err = XML.getElementsByTagName('parsererror');
    if(Err && Err.length)   return Err[0];
    var Str = content.match(tagFinder),     k = 0,   rootBegin = new RegExp('^<' + XML.firstChild.nodeName + '[\\s/>]');
    while(!rootBegin.test(Str[k]))     ++k; // preceding the root element: XML declaration, doctype declaration, whitespace, XML comments, etc.
    XML['intro']       = Str.slice(0, k);
    k = traverse(XML.firstElementChild, Str, k);
    XML['outro']       = Str.slice(k); // following the root element: whitespace, XML comments
    XML['sourceUntil'] = sourceUntil;
    return XML;
  };
  var Parser    = new DOMParser();
  var tagFinder = /<!--(?:-?[^\-])*-->|<(?:"[^"]*"|'[^']*'|[^>])*>|[^<]+/g; // identifies XML comments and tags, assuming their syntax has already be checked
  var traverse  = function(Elt, Str, k) {
    Elt['tagLiteral'] = Str[k++];
    for(var i = 0, N;     i < Elt.childNodes.length;     ++i)
      if((N = Elt.childNodes[i]).nodeType !== 1)   ++k; // text node or XML comment
      else                                         k = traverse(N, Str, k);
    if(Elt.tagLiteral.substring(Elt.tagLiteral.length - 2) !== '/>')   Elt['endTagLiteral'] = Str[k++];
    return k;
  };
  var sourceUntil = function(Node, includeSelf) {
    for(var E = [ ], i = 0;     Node !== this;     Node = Node.parentNode)
      for(E[i++] = Node.tagLiteral;     Node.previousSibling;     E[i++] = (Node = Node.previousSibling).outerSource);
    E.reverse();     if(!includeSelf)   E.pop();
    return this.intro.join('') + E.join('');
  };
})();

/** pseudo-property which holds the (reconstructed) source of the element as it appeared in the XML source file (assumes XML has been loaded by *parseXML*)  **/
Object.defineProperty(Text   .prototype, 'outerSource', { get: function() { return this.nodeValue; } });
Object.defineProperty(Comment.prototype, 'outerSource', { get: function() { return '<!--' + this.nodeValue + '-->'; } });
Object.defineProperty(Element.prototype, 'outerSource', { get: function() {
  var i = 0, ie = this.childNodes.length, E = [ this.tagLiteral ];
  while(i < ie)     E[i + 1] = this.childNodes[i++].outerSource;
  if(this.endTagLiteral)   E.push(this.endTagLiteral);
  return E.join('');
} });
Object.defineProperty(Element.prototype, 'innerSource', { get: function() {
  var i = 0, ie = this.childNodes.length, E = [ ];
  while(i < ie)     E[i] = this.childNodes[i++].outerSource;
  return E.join('');
} });


/**************************************************************************************************************************************************************/
/**                                                                  mScore Piece Description                                                                **/
/**************************************************************************************************************************************************************/

mScore['PieceDescription'] = function(XML, title) {
  this.info  = { };
  this.style = { };
  this.RP    = [ ];
  this.VC    = [ ];
  this.MV    = [ ];
  if(XML)      this.XMLDocument   = XML;
  if(title)    this.info['title'] = title;
};
mScore.PieceDescription['tagNames']  = { RP: 'pattern',          VC: 'voice',   MV: 'multiVoice',    MC: 'macro' };
mScore.PieceDescription['tagNames2'] = { RP: 'rhythm pattern',   VC: 'voice',   MV: 'multi-voice',   MC: 'macro' };
mScore.PieceDescription.prototype = {
  Err: function(ObjType, idName, inContent, msg) {
    if(typeof inContent === 'string' && !msg)   { msg = inContent;     inContent = undefined; }
    var name = (typeof idName === 'string' ? idName : mScore.PieceDescription.tagNames2[ObjType] + ' ' + (idName + 1));
    var E = (msg ? new mScore.Error(msg) : mScore.lastError).SetPieceDescription
              (this, ObjType, typeof idName === 'number' ? idName : undefined, name, inContent);
    if(ObjType === 'MC')   E.elementName = 'macro ' + E.Element.name;
    if(!E.title && this.info.title)   E.title = this.info.title;
    return E;
  },
  getXMLElement: function(ObjTypePath, id) { // id === number ——> child object index;   id === string ——> attribute
    var TN = mScore.PieceDescription.tagNames[ObjTypePath];
    return this.XMLDocument.getElementsByTagName(TN)[id];
  },
  AddVoice: function(content, attributes) {
    var V = { content: content };     this.VC.push(V);
    if(typeof attributes === 'string')
      try { if(!/^\{/.test(attributes))   attributes = '{' + attributes + '}';
            V['attributes'] = JSON.parse(attributes);                            }
      catch(E) { throw mScore.Err('Syntax error in attribute list ' + attributes + ':\n' + E.message, undefined, 'voice ' + this.VC.length).Title(this.title);}
    else if(typeof attributes === 'object') { V = V['attributes'] = { };     for(var I in attributes)     V[I] = attributes[I]; }
    return this;
  },
  AddRhythmPattern: function(content) { this.RP.push(content);     return this; },
  AddMacro: function(content, name, nArgs)  { var M = { content: content };     if(name)   M['name'] = name;     if(nArgs !== undefined)   M['args'] = nArgs;
                                              (this.MC = this.MC || [ ]).push(M);     return this;   }
};

mScore.PieceDescription.fromXML = (function() {
  return function(XML, ChangesOnly) {
    if(typeof XML === 'string' && (XML = mScore.parseXML(XML)).nodeName === 'parsererror')   return new mScore.Error(XML.firstChild.nodeValue);
    var P, i, p, p1, e, j, nUNMacro = 0,   E = new mScore.PieceDescription(XML);
    if((P = XML.getElementsByTagName('info')).length >= 1)
      for(P = P[0].children, i = 0;     i < P.length;     ++i)     if((p = P[i]).modified || !ChangesOnly)   E.info [p.nodeName] = p.innerSource;
    if((P = XML.getElementsByTagName('style')).length >= 1)
      for(P = P[0].children, i = 0;     i < P.length;     ++i)     if((p = P[i]).modified || !ChangesOnly)
        if(p.nodeName !== 'colors')   E.style[p.nodeName] = p.innerSource;
        else for((E.style['colors'] = [ ], p = p.getElementsByTagName('color')), j = 0;     j < p.length;     ++j)
          E.style.colors[j] = ((e = p[j].attributes.rgb) && e.nodeValue) || null;
    if((P = XML.getElementsByTagName('rhythmPatterns')).length >= 1)
      for(P = P[0].children, i = 0;     i < P.length;     ++i)     if((p = P[i]).modified || !ChangesOnly)   E.RP[i] = p.innerSource;
    
    
    if((P = XML.getElementsByTagName('macros')).length >= 1)
      for((P = P[0].children, i = 0), E.MC = [ ];     i < P.length;     ++i)     if((p = P[i]).modified || !ChangesOnly)
        { E.MC[i] = p1 = { content: p.innerSource };
          if(p.attributes.name)   p1['name'] = p.attributes.name.nodeValue;
          if(p.attributes.args)   p1['args'] = p.attributes.args.nodeValue;
        }
    if((P = XML.getElementsByTagName('staves')).length >= 1)
      for((P = P[0].children, i = 0), E.staves = [ ];     i < P.length;     ++i) {
        if(!((p = P[i]).modified || !ChangesOnly))   continue;
        if(p.hasAttributes())   for((j = 0, p = p.attributes), e = E.staves[i] = { };     j < p.length;     ++j)     e[p[j].name] = p[j].value;
      }
    for(P = XML.getElementsByTagName('voice'), i = 0;     i < P.length;     ++i)    if((p = P[i]).modified || !ChangesOnly) {
      e = E.VC[i] = { };     if((j = p.innerSource))   e['content'] = j;
      if(p.hasAttributes())   for((j = 0, p = p.attributes), e = e['attributes'] = { };     j < p.length;     ++j)     e[p[j].name] = p[j].value;
    }
    for(P = XML.getElementsByTagName('multiVoice'), i = 0;     i < P.length;     ++i)    if((p = P[i]).modified || !ChangesOnly) {
      e = E.MV[i] = { content: p.innerSource };
      if(p.hasAttributes())   for((j = 0, p = p.attributes), e = e['attributes'] = { };     j < p.length;     ++j)     e[p[j].name] = p[j].value;
    }
    return E;
  };
})();

/**************************************************************************************************************************************************************/
/**                                                           Stuff for parsing mScore voice input                                                           **/
/**************************************************************************************************************************************************************/

mScore['Tokenizer'] = function() {
  this.commentStructure = [ ];
  this.Items            = [ ];  // content with comments removed, then split into mScore items
  this.iCS              = 0;    // counter into *commentStructure*
  this.lenCS            = 0;    // how much content remains before the next comment occurs
  //this.iItem            = -1;   // counter into *Items*, incremented by *takeType()*
  this.curItem          = undefined; // Use this to retrieve items!
  //this.i0 = 0;     this.i1 = 0; // span of the part of *this.Item* which this tokenizer uses (can be less than all of it e.g. with a macro argument)
  //this.activeMacro      = null; // will link to the macro's own Tokenizer with added data about the arguments passed to the macro
  this.Queue = [ ];
  this.curInstance = null;
};

mScore.Tokenizer['tokenFormatsVoice'] = { // token_id: [ start_characters, format regExp (as string) ]
  b_:  ['_',          '_(?:\\^+_)?'],                        // beam connector
  bl:  [':|',         '(?:\\|{3}|:?\\|\\|:?|\\|)'],          // bar line
  ch:  ['ABCDEFG-+=', '(?:(?:\\++|-?=*)[A-G](?:#+|b+|0?))+\\.*[caud]?[rs]*(?:[+\\-]\\d+(?:\\.\\d*)?|[+\\-]\\.\\d+)?(?:m\\d*)?[o^>\'-]?'], // chord
  cs:  ['c',          'c\\d+:'],                             // color switch
  nv:  ['0123456789', '\\d+:'],                              // note value switch
  ri:  ['.',          '\\.\\.?'],                            // invisible rest 
  rp:  ['p',          'p\\d+:'],                             // rhythm pattern switch
  rv:  ['*',          '\\*\\*?(?:[+\\-]\\d+)?'],             // visible rest
  sp:  [' \t\r\n',    '\\s+'],                               // whitespace, needed for syntax highlighting
  tg:  ['<',          '<(?:"[^"]*"?|\'[^\']*\'?|[^<>])*>?'], // XML tag (loosely defined, we also allow tags that miss the closing ">")
  ti:  ['>',          '>\\d*[ud\\.]*'],                      // tie / two-note slur
  tp:  ['t',          'ts?\\d+(?:/\\d+)?[udan]?:'],          // tuplet switch
  vc:  ['\\',         '\\\\+'],                              // voice switch in a multivoice environment
  mc:  ['m',          'm[^\\s[\\]()<>]+(?:\\s*\\[)?'],       // macro call (plus optional opening of argument list)
  ms:  [',',          ','],                                  // argument separator in macro call
  me:  [']',          ']']                                   // end or macro argument list
};
mScore.Tokenizer['tokenFormatsRhythm'] = { // token_id: [ start_characters, format regExp (as string) ]
  b_:  ['_',          '_(?:\\^+_)?'],                   // beam connector
  ch:  ['0123456789', '\\d+\\.*'],                      // chord
  tg:  mScore.Tokenizer.tokenFormatsVoice.tg,           // XML tag (loosely defined, we also allow tags that miss the closing ">")
  sp:  mScore.Tokenizer.tokenFormatsVoice.sp,           // whitespace, needed for syntax highlighting
  tp:  ['t',          'tp\\d+/\\d+(?:/\\d+)?[udan]?:']  // tuplet pattern
};
mScore.Tokenizer['languageElements'] = { voice: 'Voice', multiVoice: 'Voice', pattern: 'RhythmPattern', macro: 'Macro' };
[['Voice', mScore.Tokenizer.tokenFormatsVoice], ['RhythmPattern', mScore.Tokenizer.tokenFormatsRhythm]].forEach(function(TF) {
  var initial, tokens, E = mScore.Tokenizer[TF[0]] = { initial: (initial = { }), tokens: (mScore[TF[0] + 'Format'] = tokens = { }) },
      spl = [ ], spl2 = [ ], x, fct = function(y) { initial[y] = i; };
  for(var i in (TF = TF[1])) {
    if((x = TF[i])[0].length === 1)   initial[x[0]] = i;   else   x[0].split('').forEach(fct);
    spl.push(x[1]);     if(i !== 'sp')   spl2.push(x[1]);
    tokens[i] = new RegExp('^' + x[1] + '$');
  }
  E['splitter']  = new RegExp(spl .join('|') + '|.',    'g');
  E['splitter2'] = new RegExp(spl2.join('|') + '|\\S',  'g'); // without whitespace, but we keep unidentified content for error messages
});


mScore.Tokenizer['getTempTokenizer'] = (function(TokStack) {
  var release = function() { this.Items = null;     TokStack.push(this); };
  return function(templateTok, i0, i1)
    { var T = (TokStack.length ? TokStack.pop() : new mScore.Tokenizer());     T['isTemp'] = true;     T['release'] = release;
      if(!templateTok)   return T;
      T.Items = templateTok.Items;     if(templateTok.Args)   T.Args = templateTok.Args;
      if(i0 !== undefined)    { T.i0 = i0;     T.i1 = i1; }     else   { T.i0 = templateTok.i0;     T.i1 = templateTok.i1; }
      return T;   };
})([ ]);

(function() {
  mScore.Tokenizer.prototype = {
    newSpan: function(prnt, classes, firstContent) {
      var X = document.createElement('SPAN');     X.className = classes;
      if(firstContent)   X.appendChild(document.createTextNode(firstContent));
      if(prnt === this.commentStructure)   prnt.push(X);   else prnt.appendChild(X); // *prnt* is either the array *commentStructure* or a DOM element
      return X;
    },
    appendText: function(Elt, S)  { if(S.length === 0)   return; // use this function to avoid creating unnecessary consecutive text nodes
                                    var L = Elt.lastChild;
                                    if(L && L.nodeType === 3)   L.nodeValue += S;
                                    else                        Elt.appendChild(document.createTextNode(S));   },
    prepare: function(content, language, spaceNStuff) { // content is a string, e.g. *innerSource* of an XML <voice> node
      for(var i in (CS = mScore.Tokenizer[language === 'Macro' ? 'Voice' : language]))     this[i] = CS[i]; // copy functions from prototype to object itself
      var CS, S = content.match(splitter), s, c, len = 0, E = { }, CurC;
      this.spaceNStuff = !!spaceNStuff;     (CurC = CS = this.commentStructure).length = 0;
      if(!S)   { this.Items = [ ];     return { empty: true }; }
      for(var i = 0, ie = S.length;     i < ie;     ++i)
        switch((c = ((c = code[(s = S[i]).substring(0, 1)] || 0) === 3 && s.substring(0, 4) !== '<!--') ? 4 : c)) {
          case 0:   case 4:   // (0) misc. content,   (4) XML element
            if(CurC !== CS)   { this.appendText(CurC, s);     S[i] = ''; }   else   len += s.length;
            break;
          case 1:   case 3:   // (1) opening bracket '(',   (3) XML comment <!--    -->
            if(!(CurC = this.newSpan(CurC, 'mScoreComment', s)).parentNode)   { CurC['lenBefore'] = len;     len = 0; }
            if(c === 3)   CurC = CurC.parentNode || CS; // XML comments don't contain other comments, so they get closed again immediately
            S[i] = '';     break;
          case 2:             // closing bracket ')'
            if(CurC !== CS)   { this.appendText(CurC, s);     CurC = CurC.parentNode || CS;     S[i] = ''; }   else   ++len;
            break;
        }
      if(c === 4 && s.substring(s.length - 1) !== '>')   E['openTag']        = true;
      if(c === 3 && !closeC.test(CS[CS.length - 1]))     E['openXMLcomment'] = true;
      if(CurC !== CS)   for(E['openBracket'] = 0;     CurC;     CurC = CurC.parentNode)     ++E.openBracket; // count number of nested unclosed brackets
      CS.push({ 'lenBefore': len + 1 }); // add one additional character, so *getPartVal* will not try to advance beyond the end
      this.purged = S.join(''); // input with comments removed
      this.Items  = this.purged.match(spaceNStuff ? this.splitter : this.splitter2) || [ ];
      this.lenCS  = CS[0].lenBefore;
      this.Queue  = [ (S = this.curInstance = { i0: 0,   i1: this.Items.length,   Items: this.Items,   i: -1,   Context: null }) ];
      S.Context   = S;     if(language === 'Macro')   S.isMacro = true;     return E;
    },
    pop: function( ) // for finished macro calls / arguments; to be called on the child tokenizer
      { //console.log('Pop Q[' + (this.Queue.length-1)+'] === [' + (I=this.curInstance).Items.slice(I.i0,I.i1).join(',')+']');
        if((Q = this.Queue).length <= 1)   return false; // we are at the base level, nothing to pop
        Q.pop();     var Q, I = Q[Q.length - 1];
        if(this.curInstance.parentSkip)   I.i += this.curInstance.parentSkip - 1;
        return (this.curInstance = I);                                              },
    takeType: function( ) { while(++(I = this.curInstance).i >= I.i1)   if(!this.pop())   return undefined;
                            var I, s = this.curItem = I.Items[I.i], c = this.initial[s.substring(0, 1)];
                            return (c && this.tokens[c].test(s) ? (c === 'tg' && I.Context.isMacro && mcArg.test(s) ? 'ma' : c) : 'nn');   },
    /** Append the given text content *content* (or the current item if ommitted) to the DOM element *Cnt*, splicing in any comment elements that fall
        inside it. Then fall back *nLevelsBack* parent levels (usually one) and add any comment elements that come immediately after the content.            **/
    applyMacro: function(Macros) { // assuming the the current item is of type "mc"
      var M, macroLevel = 1, I, i, j = 0, s, Q = this.Queue, S = this.curItem.match(splitMc), args, L = this.curInstance;
      if(!(M = Macros[S[1]]))    return mScore.Err('Unknown macro "' + S[1] + '" called');
      i = Q.push((this.curInstance = I = M.createInstance())) - 1;     //while(Q[--i].type === 'A')
      if(S.length === 3) { // determine the macro arguments, not getting confused by nested macro calls inside them
        (args = I['Args'] = [ ])[j] = { i0: (i = L.i + 1),   i1: undefined,   Items: L.Items,   i: 0,   Context: L };
        for(;     macroLevel && i < L.i1;     ++i)     switch(this.initial[(s = L.Items[i]).substring(0, 1)]) {
          case 'mc':  if(argMc.test(s))   ++macroLevel;     break;
          case 'ms':  if(macroLevel === 1)
                        { args[j].i1 = i;     args[++j]    = { i0: i + 1,   i1: undefined,   Items: L.Items,   i: 0,   Context: L }; }     break;
          case 'me':  if(!--macroLevel)       args[j++].i1 = i;
        }
        if(macroLevel)      return mScore.Err('Input ended before parameters of macro "' + S[1] + '" were finished');
        I['parentSkip'] = i - L.i;
      }
      if(j !== M.nArgs)     return mScore.Err('The macro "' + S[1] + '" expects ' + M.nArgs + ' arguments, but received ' + ('none' && j));
      return mScore.noError;
    },
    applyMacroArgument: function( ) { // called on the outermost tokenizer
      var iArg = (+this.curItem.substring(4).match(/\d+/)[0]) - 1,   I = this.curInstance.Context,   A = I.Args[iArg];
      //console.log('Insert argument '+iArg+' === [' + A.Items.slice(A.i0, A.i1).join(',')+'] at ' + I.i);
      this.Queue.push((this.curInstance = A));     A.i = A.i0 - 1; // need to reset the argument, it might have been used before
      //console.log('Queue [ ' + this.Queue.map(function(X){return '['+X.Items.slice(X.i0,X.i1).join(',')+'] ('+X.i+')';}).join('\n        ') + ' ]'); 
    },
    appendPartVal: function(Cnt, nLevelsBack, content) {
      if(content === undefined)   content = this.curItem;     var len = content.length, i = 0;
      if(this.lenCS > len) // the most common case: no comment inside the item or immediately behind it
        { this.lenCS -= len;     this.appendText(Cnt, content);     while(nLevelsBack--) Cnt = Cnt.parentNode;     return Cnt; }
      do  { this.appendText(Cnt, content.substring(i, (i += this.lenCS)));
            if(len > this.lenCS) { len -= this.lenCS;     this.lenCS = 0; }
            else { this.lenCS -= len;     len = 0;     while(nLevelsBack--)   Cnt = Cnt.parentNode; }
            while(!this.lenCS) {
            Cnt.appendChild(this.commentStructure[this.iCS]); // append comment <span> node which has been created by *prepare()*
                                 this.lenCS += this.commentStructure[++this.iCS].lenBefore;   }
          } while(len);
      return Cnt;
    },
    _highlight: function(prnt, Elt) { // recursive internal function for *mScore.highlight*
      this.newSpan(prnt, 'mScoreTag ' + Elt.nodeName, Elt.tagLiteral);
      for(var i = 0, N, L;     i < Elt.childNodes.length;     ++i)
        if((N = Elt.childNodes[i]).nodeType === 1)
          if((L = mScore.Tokenizer.languageElements[N.nodeName])) {
            this.newSpan(prnt, 'mScoreTag '    + N.nodeName, N.tagLiteral);
            prnt.appendChild(mScore['highlight' + L](N.innerSource, this).DOM);
            this.newSpan(prnt, 'mScoreEndTag ' + N.nodeName, N.endTagLiteral);
          } else   this._highlight(prnt, N);
        else   this.appendText(prnt, N.nodeValue);
      if(Elt.endTagLiteral)   this.newSpan(prnt, 'mScoreEndTag ' + Elt.nodeName, Elt.endTagLiteral);
    },
    parseTag: function(tag) {
      var A = tag.match(splitTag);
      if(!A || !A.length)   return mScore.Err('Syntax error in tag "' + tag + '"');
      if(A.length === 1)   return { nodeName: A[0].substring(1) };
      var E = { nodeName: A[0].substring(1),   attributes: { } };
      for(var i = 1, a;     i < A.length;     ++i)     { a = A[i].match(splitAttr);     E.attributes[a[0]] = a[1].substring(1); }
      return E;
    },
    /** finds out in which line/column of the input the item (+offset into the item) occurs. Assumes the item is not a whitespace item.                      **/
    /** This function is used to create meaningful error messages, so speed is not very important.                                                           **/
    getPosition: function(iItem, offs) {
      if(iItem === undefined)   iItem = this.curInstance.i;
      var It = (this.spaceNStuff ? this.Items : this.purged.match(this.splitter) || [ ]); // make sure we have the whitespace items, because that's where line breaks are 
      var br = /\r\n?|\n/g, spRegExp = mScore.Tokenizer.Voice.tokens.sp, iCS = 0, lenLine = 0, lenCS = this.commentStructure[0].lenBefore, isSp;
      for(var j = 0, i = -1, I, line = 0, len, C;     i < iItem;     ++j) {   
        if((isSp = spRegExp.test((I = It[j])))) { // a whitespace item, maybe it contains line breaks
          if((C = I.split(br)).length > 1)   { line += C.length - 1;     I = C[C.length - 1];     lenLine = -I.length; } 
          if(this.spaceNStuff)   ++i;
        } else   ++i; // now in any case *I* is the part after the last line break contained in this item
        len = (i === iItem ? offs : It[j].length); // when the target item is finally reached, only count up to its offset position
        while(len > lenCS) {
          len -= lenCS;     lenLine += lenCS + (C = this.commentStructure[iCS].innerText).length;
          if((C = C.split(br)).length > 1)   { line += C.length - 1;     lenLine = C[C.length - 1].length; }
          lenCS = this.commentStructure[++iCS].lenBefore;
        }
        if(I.length < len)   lenLine  = I.length; // the item is whitespace which contains a line break after the last comment
        else                 lenLine += len;
        lenCS -= len;
      }
      return { line: line, column: lenLine };
    },
    /*Err: function(iItem , offs , msg) {
      if(typeof iItem === 'string')   { msg = iItem;     offs = 0;         iItem = this.iItem; }
      if(typeof offs  === 'string')   { msg = offs;      offs = iItem;     iItem = this.iItem; }
      return mScore.ErrOffs(msg, offs).Offset(this);
    }*/
    Err: function(msg) { return (msg ? new mScore.Error(msg) : mScore.lastError).SetTokenizerPos(this); }
  };
  var splitter  = new RegExp('\\(|\\)|<!--(?:--(?!>)|-?[^\\-])*(?:-->)?|' + mScore.Tokenizer.tokenFormatsVoice.tg[1] + '|[^()<]+', 'g'),
      code      = { '<': 3, '(': 1, ')': 2 },   closeC = /-->$/,   splitTag = /^<\/?[^\s\/>]+|[^\s"'=\/>]+\s*=\s*(?:"[^<"]*"|'[^<']')/g,
      splitAttr = /[^\s"'=\/>]+|"[^<"]*(?=")|'[^<'](?=')/g,        splitMc  = /^m|[^\s[]+|\[/g,     argMc = /^m[^[]*\[$/,   mcArg = /^<arg[1-9]\d*[\s\/>]/;
})();


/**************************************************************************************************************************************************************/
/**                              Stuff for souce file syntax highlighting — hardly worth it splitting it into its own .js file                               **/
/**************************************************************************************************************************************************************/

mScore['highlight'] = function(XMLaug, Tokenizer) { // assumes *XMLaug* is an augmented XML tree as provided by mScore.parseXML; *Tokenizer* is optional
  Tokenizer = Tokenizer || new mScore.Tokenizer();
  var E = document.createElement('CODE');     E.className = 'mScore';
  for(var i = 0, tg = mScore.Tokenizer.Voice.tokens.tg, s, R = /^<?xml[\s?]/;     i < XMLaug.intro.length;     ++i)
    if(tg.test((s = XMLaug.intro[i])))   Tokenizer.newSpan(E, 'mScoreTag' + (R.test(s) ? ' XMLDecl' : ''), s);
    else                                 Tokenizer.appendText(E, s);
  Tokenizer._highlight(E, XMLaug.firstElementChild);
  for(i = 0;     i < XMLaug.outro.length;     ++i)
    if(tg.test((s = XMLaug.outro[i])))   Tokenizer.newSpan(E, 'mScoreTag', s);
    else                                 Tokenizer.appendText(E, s);
  return E;
};


(function(subsplitter, tgTest, dot, argTagTest) {
  var FCT = function(content, Tokenizer, Container, language) {
    if(!(V = Container))   (V = document.createElement('SPAN')).className = 'mScore' + language;
    if(!content)   return { DOM: V };
    var T = Tokenizer || new mScore.Tokenizer(), s, c,   E = T.prepare(content, language, true), V, nMacro = 0;
    T.appendPartVal(V, 0, ''); // if the content begins with a comment, get that out of the way
    while((c = T.takeType()))     switch(c) {
      case 'tg':    if(!tgTest.test(T.curItem))   c = 'tg-err'; // deliberate fall-through
      case 'b_':   case 'bl':   case 'cs':   case 'nv':   case 'rp':   case 'ri':   case 'vc':   case 'ma':
                    T.appendPartVal(T.newSpan(V, c), 1);     break;
      case 'tp':    if((s = T.curItem.match(subsplitter.tp)).length === 1)   { T.appendPartVal(T.newSpan(V, c), 1);     break; }
                    V = T.appendPartVal(T.newSpan(V, 'tp'), 0, s[0]);
                    T.appendPartVal(T.newSpan(V, 'cs'), 1, s[1]);
                    V = T.appendPartVal(V, 1, s[2]);     break;
      case 'rv':   case 'ti':
                    if((s = T.curItem.match(subsplitter[c])).length === 1)   { T.appendPartVal(T.newSpan(V, c), 1);     break; }
                    V = T.appendPartVal(T.newSpan(V, c   ), 0, s[0]);
                    V = T.appendPartVal(T.newSpan(V, 'cs'), 2, s[1]);     break;
      case 'ch':    if((s = T.curItem.match(subsplitter.ch)).length === 1)   { T.appendPartVal(T.newSpan(V, c), 1);     break; }
                    V = T.appendPartVal(T.newSpan(V, 'ch'), 0, s[0]);
                    if(s.length === 3)   T.appendPartVal(T.newSpan(V, 'dots'), 1, s[1]);
                    V = T.appendPartVal(T.newSpan(V, dot[(s = s[s.length - 1]).substring(0, 1)] || 'cs'), 2, s);     break;
      case 'mc':    T.appendPartVal(T.newSpan(V, 'mc'), 1, (s = T.curItem.match(subsplitter.mc))[0]);
                    if(s.length === 3)   T.appendPartVal(V, 0); // whitespace between macro name and opening '['
                    if(s.length > 1)   { V = T.appendPartVal(T.newSpan(V, 'macroPar'), 0, '');
                                         T.appendPartVal(T.newSpan(V, 'mb'), 1, '[');     ++nMacro;   }     break;
      case 'ms':    if(nMacro)         T.appendPartVal(T.newSpan(V, 'ms'), 1);                   else   T.appendPartVal(V, 0);     break;
      case 'me':    if(nMacro)   { V = T.appendPartVal(T.newSpan(V, 'ms'), 2);     --nMacro; }   else   T.appendPartVal(V, 0);     break;
      /*if(addLineSpans && (s = T.curItem.split(/\r\n?|\n/g)).length > 1) { // there can theoretically be a problem if a comment comes between \r and \n ...
                      
                      console.log(V.
                      V = T.appendPartVal(T.appendPartVal(V, 0, s[0]), 1, ''); // end previous line
                      for(var i = 1;     i < s.length - 1;     ++i)     T.appendPartVal(T.appendPartVal(T.newSpan(V, 'line'), 0, s[i]), 1, '');
                      V = T.appendPartVal(T.newSpan(V, 'line'), 0 s[i]);
                    }*/
      default:      T.appendPartVal(V, 0);     break;
    }
    E['DOM'] = V;     return E;
  };
  mScore['highlightVoice'] = function(content, Tokenizer, Container) { return FCT(content, Tokenizer, Container, 'Voice'); };
  mScore['highlightMacro'] = function(content, Tokenizer, Container) { return FCT(content, Tokenizer, Container, 'Macro'); };
  mScore['highlightRhythmPattern'] = function(content, Tokenizer, Container) {
    if(!(V = Container))   (V = document.createElement('SPAN')).className = 'mScoreRhythmPattern';
    if(!content)   return { DOM: V };
    var T = Tokenizer || new mScore.Tokenizer(), s, c,   E = T.prepare(content, 'RhythmPattern', true), V;
    T.appendPartVal(V, 0, ''); // if the content begins with a comment, get that out of the way
    while((c = T.takeType()))     switch(c) {
      case 'tg':  if(!tgTest.test(T.curItem))   c = 'tg-err'; // deliberate fall-through
      case 'b_':  T.appendPartVal(T.newSpan(V, c), 1);     break;
      case 'tp':  if((s = T.curItem.match(subsplitter.tp)) .length === 1)   { T.appendPartVal(T.newSpan(V, c), 1);     break; }
                  V = T.appendPartVal(T.newSpan(V, 'tp'), 0, s[0]);
                  T.appendPartVal(T.newSpan(V, 'cs'), 1, s[1]);
                  V = T.appendPartVal(V, 1, s[2]);     break;
      case 'ch':  if((s = T.curItem.match(subsplitter.chP)).length === 1)   { T.appendPartVal(T.newSpan(V, c), 1);     break; }
                  V = T.appendPartVal(T.newSpan(V, c),      0, s[0]);
                  V = T.appendPartVal(T.newSpan(V, 'dots'), 2, s[1]);     break;
      default:    T.appendPartVal(V, 0);     break;
    }
    E['DOM'] = V;     return E;
  };
})({ rv: /\*+|.+/g,   ti: />|&gt;|.+/g,   ch: /(?:[+\-=]*[A-G0b#]+)+|\.+|.+/g,   chP: /\d+|\.+/g,   tp: /[^udan]+|[udan]/g,   mc: /m[^\s[]+|\s+|\[/g },
   />$/,   { '.': 'dots' },   /^<arg[1-9]\d*\s*\/>$/);

/**************************************************************************************************************************************************************/
/**                                                                         type Macro                                                                       **/
/**************************************************************************************************************************************************************/

(mScore.Macro = function(name, content, nArgs) { this.name = '?';     this.nArgs = undefined;     this.content = undefined;
                                                 this.Arg = [ ];     this.Tokenizer = new mScore.Tokenizer();                 }).prototype = {
  toString: function( ) { return 'macro ' + this.name; },
  Init:     function(name, content, nArgs) {
    if(!/^[^\s[\]()<>]+$/.test((this.name = mScore.trim(name))))   return mScore.Err('“' + this.name + '” is not allowed as a macro name').Attr('name');
    if(nArgs !== undefined) {
      if((this.nArgs = mScore.parseNum(nArgs)) === false)          return mScore.Err('Expected be a number, received “'   + nArgs + '”').Attr('args');
      if(this.nArgs < 0 || (this.nArgs % 1) !== 0)                 return mScore.Err('Expected an integer ≥0, received “' + nArgs + '”').Attr('args');
    }
    var c, argNo = /\d+/, T = this.Tokenizer;     nArgs = 0;     T.prepare(content, 'Macro', false);
    while((c = T.takeType()))     if(c === 'ma' && (c = +(T.curItem.match(argNo)[0])) > nArgs)   nArgs = c;
    if(this.nArgs !== undefined && nArgs > this.nArgs)             return mScore.Err('Macro has ' + (['no arguments', '1 argument'][this.nArgs] || (this.nArgs +
                                                                                     'arguments')) + ' specified, but references arguments up to no.' + nArgs);
    if(this.nArgs === undefined)   this.nArgs = nArgs; // i.e. automatically detected number of arguments
    return this;
  },
  createInstance: function( ) // Since macros can be active several times at once, we create these temporary structures to hold their arguments etc.
    { var E = { i0: 0,   i1: this.Tokenizer.Items.length,   i: -1,   Items: this.Tokenizer.Items,   Args: [ ],   isMacro: true,   Context: null };
      E.Context = E;     return E;                                                                                                                   }
};
