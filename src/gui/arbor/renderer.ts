/// <reference path="../../../lib/jquery.d.ts" />
/// <reference path="../../../lib/arbor.d.ts" />
/// <reference path="handler.ts" />

class Renderer {
    private nodeBoxes:Point[] = []; // stores the points of the node box.
    public canvas : HTMLCanvasElement;
    public ctx : CanvasRenderingContext2D;
    public gfx : any; // Graphics lib
    public particleSystem : ParticleSystem = null;
    
    private nodeStatusColors = {
        "unexpanded": "rgb(160,160,160)", // grey
        "expanded": "rgb(51, 65, 185)", // blue
        "selected": "rgb(245, 50, 50)", // red
        "selectedAsQ": "rgb(100, 245, 50)", // green
        "selectedAsQStar": "rgb(255, 255, 0)" // yellow
    }

    private highlightSettings = {
         "color" : "rgb(245, 50, 50)", //Edge color
         "lineWidth" : 2.0
    }

    constructor(canvas : HTMLCanvasElement) {
      this.canvas = canvas;
      this.ctx = this.canvas.getContext("2d");
      this.gfx = arbor.Graphics(this.canvas);
    }

    public init(system : ParticleSystem) {
        this.particleSystem = system;
        this.resize(this.canvas.width, this.canvas.height);
        this.ctx.translate(0.5,0.5);
    }

    public resize(width, height) {
        this.particleSystem.screenSize(width, height);
        this.particleSystem.screenPadding(45, 25, 25, 25);
        this.redraw();
    }

    public redraw() {
        if (!this.particleSystem) {
            console.log("Particlesystem is not yet defined in the renderer")
            return;
        }

        // redraw will be called repeatedly during the run.
        this.gfx.clear();

        this.particleSystem.eachNode((node : Node, pt : Point) => {
            // node: {mass:#, p:{x,y}, name:"", data:{}}
            // pt:   {x:#, y:#}  node position in screen coords
            this.drawRectNode(node, pt);
        });

        // draw the edges
        this.particleSystem.eachEdge((edge : Edge, pt1 : Point, pt2 : Point) => {
            // edge: {source:Node, target:Node, length:#, data:{}}
            // pt1:  {x:#, y:#}  source position in screen coords
            // pt2:  {x:#, y:#}  target position in screen coords
            // draw a line from pt1 to pt2
            var arrowLength = 13;
            var arrowWidth = 6;
            var chevronColor = "#4D4D4D";

            var isSelfloop = edge.source.name === edge.target.name;
            var oppo = this.particleSystem.getEdges(edge.target, edge.source)[0];

            function strShorten(str) {
                return str.length > 10 ? str.substring(0,8) + ".." : str;
            }
            var label = strShorten(edge.data.datas.map((data) => data.label).join(","));

            this.ctx.save();
            if (edge.data.highlight){
                this.ctx.lineWidth = edge.data.lineWidth || this.highlightSettings.lineWidth; // Edge line width
                if (isSelfloop) {
                    this.ctx.strokeStyle = edge.data.color || this.highlightSettings.color; // Edge color*/
                } else {
                    var gradient = this.ctx.createLinearGradient(pt1.x, pt1.y, pt2.x, pt2.y);
                    gradient.addColorStop(0, "maroon");
                    gradient.addColorStop(0.4, "red");
                    gradient.addColorStop(0.6, "red");
                    gradient.addColorStop(1, "orange");
                    this.ctx.strokeStyle = gradient;
                }
            } else{
                this.ctx.strokeStyle = edge.data.color || "rgb(196, 196, 196)"; // Edge color
                this.ctx.lineWidth = edge.data.lineWidth || 2.0; // Edge line width
            }

            if (isSelfloop) {
                this.drawSelfEdge(pt1, pt2, arrowLength, arrowWidth, chevronColor, label, this.nodeBoxes[edge.target.name]);
            }
            else if (oppo != undefined) {
                /* Bend the edges, otherwise the two edges will "overlap" eachother*/
                if (edge.source == oppo.target && edge.target == oppo.source) {
                    this.drawBendingEdge(pt1, pt2, this.nodeBoxes[edge.source.name], this.nodeBoxes[edge.target.name],
                        arrowLength, arrowWidth, chevronColor, label);
                }
            }
            else {
                /*Draw normal edge*/
                this.drawNormalEdge(pt1, pt2, this.nodeBoxes[edge.source.name], this.nodeBoxes[edge.target.name],
                        arrowLength, arrowWidth, chevronColor, label)
            }
            this.ctx.restore();
        });
    }

    drawSelfEdge(pt1, pt2, arrowLength, arrowWidth, chevronColor, label, nodeBox ) {
        var cpH = 90; // horizontal offset to the control points.
        var cpV = 60; // vertical offset to the control points.

        var cp1 = arbor.Point(pt1.x - (cpH/2), pt1.y - cpV);
        var cp2 = arbor.Point(pt1.x + (cpH/2), pt1.y - cpV);

        var start = (nodeBox && this.intersect_line_box(pt1, cp1, nodeBox)) || pt1;
        var end = (nodeBox && this.intersect_line_box(cp2, pt2, nodeBox)) || pt2;

        // Draw edge
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, end.x, end.y);
        this.ctx.stroke();

        // Draw label
        if (label){
            this.drawLabel(pt2.x, pt2.y - (cpV), label);
        }

        // Draw chevron
        this.ctx.translate(end.x, end.y); // translate pointer to the top og the nodebox.
        this.ctx.rotate(-Math.atan2(-(end.y - cp2.y), end.x - cp2.x) - Math.PI/23); // Rotates in radians use (degrees*Math.PI/180)
        this.ctx.clearRect(-arrowLength/2,1/2, arrowLength/2,1) // delete some of the edge this's already there (so the point isn't hidden)
        this.drawChevron(arrowLength, arrowWidth, chevronColor); // draw the chevron
    }

    /**
     * Draw a normal edge between two nodes.
     * @param {Point}  pt1          source point
     * @param {Point}  pt2          target point
     * @param {[type]} nodeBox1     nodebox for source node
     * @param {[type]} nodeBox2     nodebox for target node
     * @param {number} arrowLength  the lenght of the arrowhead
     * @param {number} arrowWidth   the width of the arrowhead
     * @param {string} chevronColor the color of the arrowhead
     * @param {string} label        the label of the edge
     */
    drawNormalEdge(pt1: Point, pt2: Point, nodeBox1, nodeBox2, arrowLength: number, arrowWidth: number, chevronColor: string, label: string) {
        var tail : Point = this.intersect_line_box(pt1, pt2, nodeBox1)
        var temp = this.intersect_line_box(tail, pt2, nodeBox2);
        var head : Point = (temp != null) ? temp : this.intersect_line_box(pt1, pt2, nodeBox2);
        // Draw the edge.
        this.ctx.beginPath();
        this.ctx.moveTo(tail.x, tail.y);
        this.ctx.lineTo(head.x, head.y);
        this.ctx.stroke();

        // Draw the label
        if (label){ //draw the label on edge
            var offsetAngle = Math.atan2(-(pt2.y - pt1.y), pt2.x - pt1.x) + Math.PI*0.5;

            if (offsetAngle < 0){
                offsetAngle += Math.PI * 2;
            }
            else if(offsetAngle >= Math.PI*2){
                offsetAngle -= Math.PI * 2;
            }

            var offset = arbor.Point(Math.cos(offsetAngle), -Math.sin(offsetAngle)).multiply(10);
            if (offsetAngle < Math.PI * 0.25 || offsetAngle > Math.PI * 1.25) {
                offset = offset.multiply(-1);
            }

            var midPoint = pt1.add(pt2).multiply(0.5);

            this.drawLabel(midPoint.x + offset.x, midPoint.y + offset.y, label);
        }

        // Draw the arrow
        this.ctx.translate(head.x, head.y); // translate pointer to the top og the nodebox.
        this.ctx.rotate(Math.atan2(head.y - tail.y, head.x - tail.x));
        this.ctx.clearRect(-arrowLength/2,1/2, arrowLength/2,1) // delete some of the edge that's already there (so the point isn't hidden)
        this.drawChevron(arrowLength, arrowWidth, chevronColor); // draw the chevron
    }

    /**
     * The bending edges between two nodes.
     * @param {Point}  pt1          source point
     * @param {Point}  pt2          target point
     * @param {[type]} nodeBox1     nodebox for source node
     * @param {[type]} nodeBox2     nodebox for target node
     * @param {number} arrowLength  the lenght of the arrowhead
     * @param {number} arrowWidth   the width of the arrowhead
     * @param {string} chevronColor the color of the arrowhead
     * @param {string} label        the label of the edge
     */
    drawBendingEdge(pt1 : Point, pt2: Point, nodeBox1, nodeBox2, arrowLength: number, arrowWidth: number, chevronColor: string, label: string) {
        var midPoint = pt1.add(pt2).multiply(0.5);
        var angle = Math.atan2(-(pt2.y-pt1.y), pt2.x - pt1.x) - Math.PI/2;

        if(angle < 0) {
            angle += Math.PI*2;
        }

        var cpOffset = arbor.Point(Math.cos(angle), -Math.sin(angle)).multiply(45);
        var cp = midPoint.add(cpOffset);
        var start = (nodeBox1 && this.intersect_line_box(pt1, cp, nodeBox1)) || pt1;
        var end = (nodeBox2 && this.intersect_line_box(cp, pt2, nodeBox2)) || pt2;

        // Draw the edge
        this.ctx.beginPath();
        this.ctx.moveTo(start.x, start.y);
        this.ctx.quadraticCurveTo(cp.x, cp.y, end.x, end.y);
        this.ctx.stroke();

        if (label) {
            var labelcp = midPoint.add(cpOffset.multiply(0.8));
            this.drawLabel(labelcp.x, labelcp.y, label);
        }

        this.ctx.translate(end.x, end.y); // translate pointer to the top of the nodebox.
        var arrowMathRotation = Math.atan2(-(end.y-cp.y), end.x-cp.x);
        this.ctx.rotate(-arrowMathRotation);
        this.ctx.clearRect(-arrowLength/2,1/2, arrowLength/2,1); // delete some of the edge s already there (so the point isn't hidden)
        this.drawChevron(arrowLength, arrowWidth, chevronColor); // draw the chevron
    }
    /**
     * Draws the rectangle of the node
     * @param {Node}  node
     * @param {Point} pt
     */
    private drawRectNode(node: Node, pt: Point): void {
        // draw a circle centered at pt
        var label = node.data.label || "";
        var textWidth = this.ctx.measureText(label).width + 30;

        if (label && label.length > 10) {
            label = node.data.label = label.substring(0,8) + "..";
        }

        this.ctx.fillStyle = this.nodeStatusColors[node.data.status] || this.nodeStatusColors["expanded"];

        this.gfx.rect(pt.x-textWidth/2, pt.y-10, textWidth, 26, 8, {fill:this.ctx.fillStyle}); // draw the node rect
        this.nodeBoxes[node.name] = [pt.x-textWidth/2, pt.y-11, textWidth, 28]; // save the bounds of the node-rect for drawing the edges correctly.

        // draw the text
        if (label){
            if (node.data.color != 'none' || node.data.color != 'white') {
                this.drawLabel(pt.x, pt.y+8, label, 'white');
            }
            else {
                this.drawLabel(pt.x, pt.y+8, label, 'black');
            }
        }
    }

    /**
     * Draws the label upon the edge
     * @param {number}                   x     the x coordinate
     * @param {number}                   y     the y coordinate
     * @param {string}                   label the text to be written.
     * @param {CanvasRenderingContext2D} ctx   the canvas to draw on.
     */
    private drawLabel(x : number, y : number, label : string, color? : string) : void {
        this.ctx.save();
        this.ctx.font = "14px 'Open Sans'";
        this.ctx.textAlign = "center";
        this.ctx.fillStyle = color === undefined ? "black" : color;
        this.ctx.fillText(label, x, y);
        this.ctx.restore();
    }

    /**
     * Draws the arrowhead
     * @param {number}                   arrowLength the length of the arrowhead
     * @param {number}                   arrowWidth  the width of the arrowhead
     * @param {string}                   color       the color of the arrowhead
     * @param {CanvasRenderingContext2D} ctx         the canvas
     */
    private drawChevron(arrowLength : number, arrowWidth : number, color : string) : void {
        this.ctx.save()
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.moveTo(-arrowLength, arrowWidth);
        this.ctx.lineTo(0, 0);
        this.ctx.lineTo(-arrowLength, -arrowWidth);
        this.ctx.lineTo(-arrowLength * 0.8, -0);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.restore();
    }

    // helpers for figuring out where to draw arrows (thanks springy.js)
    private intersect_line_line(p1 : Point, p2 : Point, p3 : Point, p4 : Point) : Point {
        var denom = ((p4.y - p3.y)*(p2.x - p1.x) - (p4.x - p3.x)*(p2.y - p1.y));
        if (denom === 0){
            return null; // lines are parallel
        }

        var ua = ((p4.x - p3.x)*(p1.y - p3.y) - (p4.y - p3.y)*(p1.x - p3.x)) / denom;
        var ub = ((p2.x - p1.x)*(p1.y - p3.y) - (p2.y - p1.y)*(p1.x - p3.x)) / denom;

        if (ua < 0 || ua > 1 || ub < 0 || ub > 1) {
            return null;
        }

        return arbor.Point(p1.x + ua * (p2.x - p1.x), p1.y + ua * (p2.y - p1.y));
    }

    private intersect_line_box(p1 : Point, p2 : Point, boxTuple : any) : Point {
        var p3 = arbor.Point(boxTuple[0], boxTuple[1]);
        var w = boxTuple[2];
        var h = boxTuple[3];

        var tl = arbor.Point(p3.x, p3.y);
        var tr = arbor.Point(p3.x + w, p3.y);
        var bl = arbor.Point(p3.x, p3.y + h);
        var br = arbor.Point(p3.x + w, p3.y + h);

        return this.intersect_line_line(p1, p2, tl, tr) ||
             this.intersect_line_line(p1, p2, tr, br) ||
             this.intersect_line_line(p1, p2, br, bl) ||
             this.intersect_line_line(p1, p2, bl, tl) ||
             arbor.Point(p2.x, p2.y);
    }
}
