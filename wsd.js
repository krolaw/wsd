// Copyright 2021 - https://richard.warburton.it/

const ns = "http://www.w3.org/2000/svg";

const defaultCSS = `
svg { border: 1pt black solid; display: inline-block; 
    font-family: sans-serif; stroke: black; stroke-width: 1; fill:none}
svg > .title, .opt text { font-weight: bold;}
svg .arrow .head { fill: black }
svg .dashed { stroke-dasharray: 5,2 }
svg .opt rect.border, .opt line, .opt path { stroke-width: 2 }
text { fill: black; stroke-width: 0 }
rect.text { stroke-width: 0; fill-opacity:0.7; }
.opt line { stroke-dasharray: 2,2 }
.background { fill: white }`;

class SequenceDiagram extends HTMLElement {
    connectedCallback() { 
        this.attachShadow({mode: 'open'});
        Diagram(this.shadowRoot,this.getAttribute('data'),
            this.getAttribute('css'),this.getAttribute('css-url'));
    }
}

const gap = 10;

function Diagram(dom, data, css, cssURL) {
    const defStyle = document.createElement('style');
    defStyle.textContent = defaultCSS;
    dom.appendChild(defStyle);

    if(cssURL) {
        const linkElem = document.createElement('link');
        linkElem.setAttribute('rel', 'stylesheet');
        linkElem.setAttribute('href', cssURL);
    }

    if(css) {
        const s = document.createElement('style');
        s.textContent = css;
        dom.appendChild(s);
    }
    
    let currentIf;
    let alias = {};
    let actors = [];
    actorsIndexOf = (name) => {
        let i = actors.indexOf(name);
        if(i == -1) {
            i = actors.length;
            actors.push(name);
        }
        if(currentIf != null) {
            currentIf.left = Math.min(currentIf.left, i);
            currentIf.right = Math.max(currentIf.right, i);
        }
        return i;
    };

    let actions = [];
    let title = "";
        
    let svg = document.createElementNS(ns, 'svg');
    dom.appendChild(svg);

    
    let lines = data.split("\n");

    for(var i in lines) {
        let line = lines[i].trim();
        if(line.length == 0 || line.startsWith('//')) continue;
        
        let [cmd,param] = split(line,':');
        switch(cmd) {
            case 'title': title = param; break;
            case 'alias':
                let [left,right] = split(param,"->");
                if(right != null) alias[left] = right;
                break;
            case null: break;
            case 'note left': {
                let [from,comment] = split(param,":");
                let fromIndex = actorsIndexOf(from);
                let n = new Note(svg,fromIndex,fromIndex-1,comment);
                actions.push(n);
                if(currentIf) currentIf.children.push(n);
            }break;
            case 'note right': {
                let [from,comment] = split(param,":");
                let fromIndex = actorsIndexOf(from);
                let n = new Note(svg,fromIndex,fromIndex+1,comment);
                actions.push(n);
                if(currentIf) currentIf.children.push(n);
            }break;
            case 'if': {
                let [title,comment] = split(param,":");
                currentIf = new Opt(svg, currentIf, title, comment);
                actions.push(currentIf);
            }break;
            case 'elif': {
                if(!currentIf) break;
                let [title,comment] = split(param,":");
                currentIf.elif(title, comment);
                actions.push(currentIf);
            }break;
            case 'end': {
                if(!currentIf) break;
                actions.push(currentIf);
                currentIf.end();
                currentIf = currentIf.parent;
            }break;
            default:
                let [from,to] = split(cmd,"->");
                if(to == null) continue;
                let dashed = false;
                if(from.substr(from.length-1)=='-') {
                    dashed = true;
                    from = from.substr(0,from.length-1);
                }
                let fromIndex = actorsIndexOf(from);
                let toIndex = actorsIndexOf(to);
                if(fromIndex == toIndex) {
                    actions.push(new Loop(svg, fromIndex, fromIndex+1, param, dashed))
                    break;
                }
                actions.push(new Arrow(svg, fromIndex,toIndex, param, dashed));
        }
        
    }

    let top = gap;
    let titleObj;
    let width = 0;

    if(title != "") {
        titleObj = new Text(svg,title,"title");
        width = titleObj.width+2*gap;
        top += titleObj.height+gap;
    }

    let heads = [];
    let actHeight = 0;
    for(let i in actors) {
        let name = actors[i];
        let actor = new Actor(svg, alias[name] ?? name);
        actHeight = Math.max(actHeight, actor.minHeight);
        heads.push(actor);
    }

    let centers = [];
    let left = gap;
    for(let i in heads) {
        let h = heads[i];
        centers.push(left+h.width/2);
        left += h.width + gap;
    }
    centers.push(left);

    for (let i in actions) {
        let a = actions[i];
        let leftIndex = Math.min(a.toIndex(),a.fromIndex());
        let rightIndex = Math.max(a.toIndex(),a.fromIndex());

        // Centres
        let d = a.minWidth() - centers[rightIndex]+centers[leftIndex];
        if(d > 0) for(let i = rightIndex ; i<centers.length ; i++) centers[i] += d;

        // Left
        let l = a.leftEdge() - centers[leftIndex] + (centers[leftIndex-1] ?? 0);
        if(l > 0) for(let i = leftIndex ; i<centers.length ; i++) centers[i] += l;

        // Right
        let r = a.rightEdge() - centers[rightIndex+1] + centers[rightIndex];
        if(r > 0) for(let i = rightIndex+1 ; i<centers.length ; i++) centers[i] += r;
    }

    for(let i in heads) {
        let h = heads[i];
        h.position(centers[i]-h.width/2, top, actHeight);
    }

    let headBottom = top+actHeight;
    top += actHeight + gap;

    for (let i in actions) {
        let a = actions[i];
        a.position(top,centers[a.fromIndex()] ?? 0,centers[a.toIndex()] ?? 0);
        top += a.height+gap;
    }

    for (let i in heads) {
        let c = centers[i];
        svg.insertBefore(makeSvg(null,'line',null,{'x1':c,'x2':c,'y1':headBottom,'y2':top}),svg.firstChild);
    }

    svg.insertBefore(makeRect(null, 0,0,"100%", "100%", "background"),svg.firstChild);


    width = Math.max(width,centers[centers.length-1]);

    svg.setAttribute("width",width);
    svg.setAttribute("height",top+gap);

    titleObj.move((width-titleObj.width)/2,gap);
}

function split(str,sep) {
    let pos = str.search(sep);
    if(pos == -1) return [str,null];
    return [str.substr(0,pos).trim(),
        str.substr(pos+sep.length).trim()];
}

function setAttrs(obj, attrs) {
    if(attrs) for(var i in attrs) obj.setAttribute(i, attrs[i]);
}

function makeSvg(parent, type, className, attrs) {
    let obj = document.createElementNS(ns, type);
    if(className) obj.classList.add(className);
    setAttrs(obj,attrs);
    if(parent) parent.appendChild(obj);
    return obj;
}

function makeTop(dom, className) {
    return makeSvg(dom, 'g', className);
}

class TSpan {
    constructor(parent, content, className) {
        this.obj = makeSvg(parent,'tspan',className);
        this.obj.textContent = content;
        setAttrs(this.obj,{"x":0,"y":0});
        this.box = this.obj.getBBox();
    }
    move(x,y) {
        this.obj.setAttribute("x",x-this.box.x);
        this.obj.setAttribute("y",y-this.box.y);
    }
}

class Text {
    constructor(parent, content, className, attrs) {
        this.bk = makeRect(parent, 0,0,0,0,"text");
        this.bk.classList.add("background")
        this.obj = makeSvg(parent, 'text', className, attrs);
        this.width = 0;
        this.height = 0;
        this.spans = [];
        content.split("\\n").forEach(t=>{
            let span = new TSpan(this.obj, t);
            this.spans.push(span);
            this.height += span.box.height;
            this.width = Math.max(this.width, span.box.width);
        });
        setAttrs(this.bk,{width:this.width,height:this.height});
    }
    move(x,y) { 
        this.bk.setAttribute("x",x);
        this.bk.setAttribute("y",y);
        this.spans.forEach(s=>{ s.move(x,y); y += s.box.height; });
    }
}

function makeRect(parent, left, top, width, height, className) {
    return makeSvg(parent, "rect", className, 
        {"x":left, "y": top, "width": width, "height": height});
}

class Actor {
    constructor(dom, name) {
        this.top = makeTop(dom,'actor');
        this.title = new Text(this.top,name,'title');
        this.width = this.title.width+2*gap;
        this.minHeight = this.title.height+2*gap;
    }   

    position(left, top, height) {
        makeRect(this.top, left, top, this.width, height);
        this.title.move(left+this.width/2-this.title.width/2,top+height/2-this.title.height/2);
    }
}

class Action {
    constructor(dom, name, fromIndex, toIndex, comment) {
        this.fromIndex = () => fromIndex;
        this.toIndex = () => toIndex;
        this.top = makeTop(dom,name);
        this.comment = new Text(this.top,comment);
    }
    leftEdge() {return 0};
    rightEdge() {return 0};
}

class Arrow extends Action {
    constructor(dom,fromIndex,toIndex,comment,dashed) {
        super(dom,'arrow',fromIndex,toIndex, comment);
        this.line = makeSvg(this.top,'line',dashed?'dashed':null);
        this.minWidth = () => this.comment.width+3*gap;
        this.height = this.comment.height+gap+gap/4;
        this.head = makeSvg(this.top,'path','head');
    }

    position(top, from, to) {
        let y = top+this.comment.height+gap/4;
        setAttrs(this.line, {'x1':from, 'x2':to, 'y1':y, 'y2':y  });
        this.line.classList.add('line');
        this.comment.move((to<from ? from-gap-this.minWidth()+3*gap : from+gap),top);
        let dir = gap * Math.sign(from-to);
        this.head.setAttribute('d', 'M'+to+','+y
            +'l'+dir+','+gap/2+'l0,'+(-gap)+'z');
    }
}

class Note extends Action {
    constructor(dom,fromIndex,toIndex,comment) {
        super(dom,'note',fromIndex,fromIndex,comment);
        let f = () => this.comment.width+5*gap;
        if(fromIndex < toIndex) {
            this.rightEdge = f;
        } else this.leftEdge = f;
        this.minWidth = () => 0; //this.comment.width+4*gap;
        this.height = this.comment.height+2*gap;
    }

    position(top, from, to) {
        let x = this.leftEdge() == 0 ? (from+gap) : (from-this.leftEdge()+2*gap);
        this.comment.move(x+gap, top+gap);
        let h = this.height;
        let w = this.leftEdge()+this.rightEdge()-3*gap;
        makeSvg(this.top,'path',null,{"d":"M"+(x+w-gap)+","+top+"l"+(gap-w)+",0l0,"+
            h+"l"+w+",0l0"+(gap-h)+"l"+(-gap)+","+(-gap)+"l0,"+gap+"l"+gap+",0"});
    }
}

class Loop extends Action {
    constructor(dom,fromIndex,toIndex,comment, dashed) {
        super(dom,'arrow',fromIndex,toIndex,comment);
        this.minWidth = () => Math.max(this.comment.width+2*gap,6*gap);
        this.height = this.comment.height+2*gap;
        this.dashed = dashed;
    }

    position(top, from, to) {
        let x = from+gap;
        this.comment.move(x,top+gap/2);
        makeSvg(this.top,'path','line'+this.dashed?"dashed":"",{"d":"M"+from+","+
            top+"l"+(this.comment.width+2*gap)+",0l0,"+ (this.comment.height+1.5*gap)+
            "l"+(-this.comment.width-gap)+",0"});
        makeSvg(this.top,'path','head',{'d': 'M'+from+','+(top+this.height-.5*gap)
            +'l'+gap+','+gap/2+'l0,'+(-gap)+'z'});
    }
}

class Opt {
    constructor(dom, parent, title, comment) {
        this.top = makeTop(dom,'opt');
        this.children = [];
        if(parent) {
            this.parent = parent;
            parent.children.push(this);
        }
        let titleSvg = new Text(this.top, title, 'title');
        let commentSvg = new Text(this.top, comment, 'comment');
        this.titles = [titleSvg];
        this.comments = [commentSvg];
        this.left = Number.MAX_SAFE_INTEGER;
        this.right = -1;
        this.height = Math.max(titleSvg.height+gap,commentSvg.height+gap/2);
        this.minWidth = () => 1;
    }

    fromIndex() { return this.children.reduce((c,v)=>Math.min(c,v.fromIndex()),this.left); }
    toIndex() { return this.children.reduce((c,v)=>Math.max(c,v.toIndex()),this.right); }

    elif(title, comment) {
        this.width = Math.max(this.width ?? 0, this.titles[this.titles.length-1].width+
            this.comments[this.comments.length-1].width+3*gap);
        let titleSvg = new Text(this.top, title, 'title');
        let commentSvg = new Text(this.top, comment, 'comment');
        this.titles.push(titleSvg);
        this.comments.push(commentSvg);
    }

    end() {}

    leftEdge() { return gap+this.children.filter((c)=>c.fromIndex() == this.left).reduce((t,c)=>Math.max(t,c.leftEdge()),0); }
    rightEdge() { return gap+this.children.filter((c)=>c.toIndex() == this.right).reduce((t,c)=>Math.max(t,c.rightEdge()),this.calcWidth() - this.leftEdge()); }

    calcWidth() {
        let w = 0;
        for(let i = 0; i < this.titles.length ; i++) {
            w = Math.max(w, this.titles[i].width+this.comments[i].width);
        }
        return w+gap*2;
    }

    position(top, from, to) {
        let le = this.leftEdge();
        if(this.rect == null) {
            this.topY = top;
            this.farRight = to+this.rightEdge()-gap;
            this.rect = makeRect(this.top, from-le, top, this.farRight-from+le, 0, "border");
        } else {
            makeSvg(this.top,"line","divider",{x1:from-le,y1:top,x2:this.farRight,y2:top});
        }
        if(this.titles.length > 0) {
            let t = this.titles.splice(0,1)[0];
            if(t.width > 0)
            makeSvg(this.top,"path","label",{"d":"M"+(from-le)+","+(top+t.height+gap)+
                "l"+(t.width+gap/2)+",0l"+(gap/2)+",-"+(gap/2)+"l0,-"+(t.height+gap/2)+
                "l-"+(t.width+gap)+",0"});
            let c = this.comments.splice(0,1)[0];
            t.move(from-le+gap/2,top+gap/2);
            c.move(from-le+gap/2+t.width+gap,top+gap/2);
            this.height = Math.max(t.height+gap,c.height+gap/2);
        } else {
            this.height = 1;
        }
        this.rect.setAttribute("height", top-this.topY);
    }
}

customElements.define('sequence-diagram', SequenceDiagram);