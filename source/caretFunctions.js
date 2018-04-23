
/** In HTML/javascript carets are a messy business. Suppose the caret is positioned somewhere inside a container element (e.g. <div>) which contains
    syntax highlighting, i.e. lots of (sometimes nested) <span>s for formatting. Then the caret returned by *window.getSelection()* may be one of these types:
  1) in the container, i.e. at the boundary between two of its child nodes
  2) at the start of a child element node; using backspace or DEL in the container can mean that that element is empty — they don't get consistently removed
  3) inside (start, middle, end) a text node of the container
  4) inside (start, middle, end) a text node of a child node of the container
    The character position of the caret can make it ambiguous which of these types applies; it may depend on the pixel position of the mouse when
    click-positioning the caret, or the direction we arrive from when positioning the caret with arrow keys. Also the behaviour varies between browsers.     **/

CaretFunctions = {
  /** Returns the current caret (assumed to stand somewhere inside the element *Container*) as an object { Node, offs }, where
        *Node* is a direct child node of *Container* and
        *offs* is an offset into it, which is not the node's end;
      *Node* is null if the caret is at *Container*'s end.          **/
  standardCaret: function(Container) {
    var Sel = window.getSelection(), N = Sel.anchorNode, N2, E = { Node: null,   offs: (N.nodeType === 3 ? Sel.anchorOffset : 0) };
    if(N === Container)   { if(N.childNodes.length > Sel.anchorOffset)   E.Node = N.childNodes[Sel.anchorOffset];     return E; }
    for(E.Node = N;     N.parentNode && N.parentNode !== Container;     N = N.parentNode)
      for(N2 = N.parentNode.firstChild;     N2 !== N;     N2 = N2.nextSibling)     E.offs += (N2.textContent ? N2.textContent.length : 0);
    if(E.Node.nodeType === 3 && E.offs === (N.textContent || '').length)   { E.Node = N.nextSibling;     E.offs = 0; }   else    E.Node = N;
    return E;
  },
  
  /** Produces an array of consecutive child nodes (text and elements) of *Container* around the current caret, such that it contains content to the left of
      the caret which comes from *nLeft* non-empty nodes, and *nRight* from the right (a node can count both to the left and to the right if the caret stand
      in the middle of it); if not enough nodes exist in the container, fewer are returned.
      The array also received a property *offs* which is the caret's character offset into the content of the node array.                                    **/
  aroundCaret: function(Container, nLeft, nRight) {
    var Car = CaretFunctions.standardCaret(Container),   N = Car.Node,   Nodes = [ N ],   n, i, ie;
    if(!N)  { for(i = 0, ie = Container.childNodes.length - 1, Nodes.pop();     ie >= 0 && i < 2;     --ie)
                { Nodes.unshift((N = Container.childNodes[ie]));     if((n = (N.textContent ? N.textContent.length : 0)))   { ++i;   Car.offs += n; }   }
              Nodes['offs'] = Car.offs;     return Nodes;                                                                             }
    for(nLeft = (nLeft === undefined ? 2 : nLeft) - (Car.offs ? 1 : 0), N = N.previousSibling;        nLeft  && N;     N = N.previousSibling)
      { Nodes.unshift(N);     if((n = (N.textContent ? N.textContent.length : 0)))   { ++nLeft;   Car.offs += n; }   }
    for(nRight = (nRight === undefined ? 2 : nRight),                   N = Car.Node.nextSibling;     nRight && N;     N = N.nextSibling)
      { Nodes.push(N);        if((n = (N.textContent ? N.textContent.length : 0)))     ++nRight;   }
    Nodes['offs'] = Car.offs;     return Nodes;
  },
  
  setCaret: function(Nodes, offs) {
    for(var i = 0, n, N;   i < Nodes.length;   ++i)   if((n = ((N = Nodes[i]).textContent ? N.textContent.length : 0)) <= offs)   offs -= n;
                                                      else  { if(N.nodeType === 3)   window.getSelection().collapse(N, offs);
                                                              else                   CaretFunctions.setCaret(N.childNodes, offs);
                                                              return;                                                               }
    if(N.nextSibling)   window.getSelection().collapse(N.nextSibling, 0);
    else                window.getSelection().collapse(N.parentNode,  N.parentNode.childNodes.length);
  }
};


/** Firefox allows multiple range selections which messes with syntax highlighting, so we suppress them **/
document.onselectionchange = function() { for(var S = window.getSelection();     S.rangeCount > 1;     S.removeRange(S.getRangeAt(0))); };