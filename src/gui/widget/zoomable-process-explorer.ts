/// <reference path="../../../lib/jquery.d.ts" />
/// <reference path="../../../lib/ccs.d.ts" />
/// <reference path="../../../lib/util.d.ts" />
/// <reference path="../gui.ts" />
/// <reference path="../arbor/arbor.ts" />
/// <reference path="../arbor/renderer.ts" />

module GUI.Widget {

    function clamp(val : number, min : number, max : number) {
        return Math.max(Math.min(val, max), min);
    }

    export class ZoomableProcessExplorer {
        private zoomMax = 3;
        private zoomMin = 1;
        private zoomStep = 0.2;
        private zoomDefault = 1;

        private $zoomRange : JQuery;
        private $freezeBtn : JQuery;
        private isFrozen = false;
        private root = document.createElement("div");
        private canvasContainer = document.createElement("div");
        private canvas : HTMLCanvasElement = document.createElement("canvas");

        private renderer : Renderer = new Renderer(this.canvas);
        private graphUI : GUI.ProcessGraphUI = new ArborGraph(this.renderer);
        private succGen : CCS.SuccessorGenerator = null;

        private currentZoom = 1;
        private expandDepth = 5;

        constructor() {
            $(this.root).addClass("widget-zoom-process-explorer");
            $(this.canvasContainer).addClass("canvas-container").attr("id", "hml-canvas-container");
            this.setupRange();
            this.setupFreezeBtn();

            var $pullRight = $('<div class="btn-group pull-right button-row"></div>').append(this.$freezeBtn);
            var $buttonDiv = $('<div class="widget-zoom-proces-explorer-toolbar"></div>').append(this.$zoomRange, $pullRight)
            $(this.canvasContainer).append(this.canvas);
            $(this.root).append($buttonDiv, this.canvasContainer);

            this.graphUI.bindCanvasEvents();
        }

        getRootElement() : HTMLElement {
            return this.root;
        }

        getCanvasContainer() : HTMLElement {
            return this.canvasContainer;
        }

        setExpandDepth(depth) {
            this.expandDepth = depth;
        }

        setZoom(zoomFactor : number) : void {
            var $canvas = $(this.canvas),
                $root = $(this.root),
                $canvasContainer = $(this.canvasContainer),
                canvasWidth, canvasHeight;
            zoomFactor = clamp(zoomFactor, this.zoomMin, this.zoomMax);
            //TODO
            //By enlarging the canvas but not its containing element we zoom in.

            canvasWidth = $canvasContainer.width() * zoomFactor;
            canvasHeight = $canvasContainer.height() * zoomFactor;
            this.canvas.width = canvasWidth;
            this.canvas.height = canvasHeight;
            this.renderer.resize(canvasWidth, canvasHeight);

            //Not sure why this
            if (zoomFactor > 1) {
                this.$freezeBtn.parent().css("right", 30);
                $canvasContainer.css("overflow", "auto");
                this.focusOnProcess(this.succGen.getProcessById(parseInt(this.graphUI.getSelected())));
            } else {
                this.$freezeBtn.parent().css("right", 10);
                $canvasContainer.css("overflow", "hidden");
            }
        }

        toggleFreeze() {
            this.isFrozen = !this.isFrozen;
            if (this.isFrozen) {
                this.graphUI.freeze();
                this.$freezeBtn.find("i").removeClass("fa-unlock-alt").addClass("fa-lock");
            } else {
                this.graphUI.unfreeze();
                this.$freezeBtn.find("i").removeClass("fa-lock").addClass("fa-unlock-alt");
            }
            //TODO Handle other affected things.
        }

        resize(width, height) : void {
            var $root = $(this.root);
            var $canvasContainer = $(this.canvasContainer);
            height = Math.max(265, height);
            
            $root.width(width); // they must be the same size?
            $root.height(height);
            $canvasContainer.width(width); // they must be the same size?
            $canvasContainer.height(height);
            
            //Fix zoom
            this.setZoom(this.currentZoom);
        }

        exploreProcess(process : CCS.Process) : void {
            if (!this.succGen) throw "Invalid operation: succGen must be set first";
            this.drawProcess(process);
        }

        focusOnProcess(process : CCS.Process) : void {
            var position = this.graphUI.getPosition(process.id.toString()),
                $canvasContainer = $(this.canvasContainer);
            $canvasContainer.scrollLeft(position.x - ($canvasContainer.width() / 2));
            $canvasContainer.scrollTop(position.y - ($canvasContainer.height() / 2));
        }

        setSuccGenerator(succGen : CCS.SuccessorGenerator) {
            this.succGen = succGen;
            this.clear();
        }

        clear() : void {
            this.graphUI.clearAll();
        }

        private drawProcess(process : CCS.Process) {
            this.showProcess(process);

            var allTransitions = CCS.expandBFS(process, this.succGen, this.expandDepth);
            for (var fromId in allTransitions) {
                var fromProcess = this.succGen.getProcessById(fromId);
                this.showProcess(fromProcess);
                var groupedByTargetProcessId = ArrayUtil.groupBy(allTransitions[fromId].toArray(), t => t.targetProcess.id);

                Object.keys(groupedByTargetProcessId).forEach(strProcId => {
                    var group = groupedByTargetProcessId[strProcId],
                        data = group.map(t => { return {label: t.action.toString()}; }),
                        numId = parseInt(strProcId, 10);
                    this.showProcess(this.succGen.getProcessById(numId));
                    this.graphUI.showTransitions(fromProcess.id, numId, data);
                });
            }

            this.graphUI.setSelected(process.id.toString());
        }


        private showProcess(process : CCS.Process) : void {
            //Check if necessary for check
            if (this.graphUI.getProcessDataObject(process.id)) return;
            this.graphUI.showProcess(process.id, {label: this.labelFor(process)});
        }

        private labelFor(process : CCS.Process) : string {
            return (process instanceof CCS.NamedProcess) ? (<CCS.NamedProcess> process).name : process.id.toString();
        }

        private setupRange() {
            var $range = $("<input></input>");
            $range.prop("type", "range");
            $range.prop("min", this.zoomMin);
            $range.prop("max", this.zoomMax);
            $range.prop("step", this.zoomStep);
            $range.prop("value", this.zoomDefault);
            this.$zoomRange = $range;

            var changeEvent = (navigator.userAgent.indexOf("MSIE ") > 0 ||
                               !!navigator.userAgent.match(/Trident.*rv\:11\./))
                               ? "change" : "input";
            this.$zoomRange.on(changeEvent, () => {
                this.currentZoom = this.$zoomRange.val();
                this.setZoom(this.currentZoom);
                });
        }

        private setupFreezeBtn() {
            var $button = $('<button class="btn btn-default btn-sm"></button>'),
                $lock = $('<i class="fa fa-lg fa-unlock-alt"></i>');
            $button.data("frozen", false);
            $button.append($lock);
            this.$freezeBtn = $button;
            this.$freezeBtn.on("click", () => this.toggleFreeze());
        }
    }
}