module Activity {

    var Tooltips = {
        "collapse-none": "Do not collapse the labelled transition system.",
        "collapse-strong": "Collapse all processes that are strongly bisimilar (∼) into a single process.",
        "collapse-weak": "Collapse all processes that are weakly bisimilar (≈) into a single process.",
        "collapse-tccs-strong-timed": "Collapse all processes that are strongly timed bisimilar (∼<sub>t</sub>) into a single process.",
        "collapse-tccs-strong-untimed": "Collapse all processes that are strongly untimed bisimilar (∼<sub>u</sub>) into a single process.",
        "collapse-tccs-weak-timed": "Collapse all processes that are weakly timed bisimilar (≈<sub>t</sub>) into a single process.",
        "collapse-tccs-weak-untimed": "Collapse all processes that are weakly untimed bisimilar (≈<sub>u</sub>) into a single process.",
        "simplify": "Simplify processes by applying structural congruence.",
        "depth": "Set the unfolding depth of the labelled transition system.",
        "freeze": "Lock/unlock the current location of states.",
        "save-image": "Export the labelled transition system."
    }

    export function addTooltips() {
        //Non delegating since these tooltips only cover static elements.
        $("[data-tooltip]").tooltip({
            title: function() {
                return Tooltips[this.dataset.tooltip];
            },
            delay: {
                "show": 500,
                "hide": 100
            },
            html: true
        });
    }
    
    export class Tooltip {
        protected $container : JQuery;
        
        constructor($container : JQuery, titleFunction : Function, selectorClass : string) {
            this.$container = $container;
            
            var thisTooltip = this;
            // Ugly, but we need the to separate from the lexical the dynamic 'this'.
            this.$container.tooltip({
                title: function () { return titleFunction(thisTooltip, this);  },
                selector: "span." + selectorClass,
                html: true
            });
        }
        
        // used for matching process names/ids globally
        static wrapProcess(text : string) : JQuery {
            return $("<span>").append(text);
        }
        
        static wrap(text : string) : JQuery {
            return $("<span>").attr("class", "ccs-tooltip").append(text);
        }
        
        static setTooltip($element : JQuery, text : string) : JQuery {
            $element.tooltip({title: text});
            return $element;
        }
        
        static strongSequence(abstractingSuccGen : Traverse.AbstractingSuccessorGenerator, source : CCS.Process, action : CCS.Action, target : CCS.Process, graph = null) : string {
            var graph = graph || Project.getInstance().getGraph();
            var labelFor = graph.getLabel.bind(graph);
            var strictPath = abstractingSuccGen.getStrictPath(source.id, action, target.id);
            var strongActions = labelFor(source);
            
            for (var i = 0; i < strictPath.length; i++) {
                var actionStr : string;
                // if (abstractingSuccGen.getAbstractions().some(abstraction => abstraction.getLabel() === strictPath[i].action.getLabel())) {
                //     actionStr = abstractingSuccGen.getAbstractions().map(abstraction => abstraction.toString()).join("/");
                // } else {
                    actionStr = strictPath[i].action.toString();
                // }
                strongActions += " -" + actionStr + "-> " + labelFor(strictPath[i].targetProcess);
            }
            
            return strongActions;
        }

    }
    
    export class ProcessTooltip extends Tooltip {
        private visitor : Traverse.TCCSNotationVisitor;
        private graph : CCS.Graph;
        
        constructor($container : JQuery) {
            var titleFunction = function(tooltipOwner, domElement) {
                var process = tooltipOwner.graph.processByLabel($(domElement).text());
                return getCCSNotation(process);
            };
            
            super($container, titleFunction, "ccs-tooltip-process");

            this.visitor = new Traverse.TCCSNotationVisitor();
            var getCCSNotation = this.ccsNotationForProcessId.bind(this);
        }
        
        public ccsNotationForProcessId(idOrName : string) : string {
            var process = this.graph.processByName(idOrName) || this.graph.processById(idOrName);
            var text : string;

            if (process) {
                if (process instanceof ccs.NamedProcess) {
                    text = this.visitor.visit((<ccs.NamedProcess>process).subProcess);
                } else if (process instanceof ccs.CollapsedProcess) {
                    var labelFor = this.graph.getLabel.bind(this.graph);
                    var subLabels = process.subProcesses.map(subProc => labelFor(subProc));
                    text = "{" + subLabels.join(", ") + "}";
                } else {
                    text = this.visitor.visit(process);
                }
            }

            return this.graph.getLabel(process) + " = " + text;
        }
        
        public setGraph(graph : CCS.Graph) : void {
            this.graph = graph;
            this.visitor.clearCache();
        }
    }
    
    export class DataTooltip extends Tooltip {
        constructor($container : JQuery) {
            var titleFunction = function(tooltipOwner, domElement) {
                return $(domElement).data("tooltip");
            };

            super($container, titleFunction, "ccs-tooltip-data");
        }
    }
}
