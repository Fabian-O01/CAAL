/// <reference path="../../lib/d3.d.ts" />
/// <reference path="../gui/project.ts" />
/// <reference path="../gui/gui.ts" />
/// <reference path="../gui/arbor/arbor.ts" />
/// <reference path="../gui/arbor/renderer.ts" />
/// <reference path="activity.ts" />

module Activity {

    import dg = DependencyGraph;

    export class Game extends Activity {
        private project : Project;
        private graph : CCS.Graph;
        private succGen : CCS.SuccessorGenerator;
        private $gameType : JQuery;
        private $playerType : JQuery;
        private $leftProcessList : JQuery;
        private $rightProcessList : JQuery;
        private $leftContainer : JQuery;
        private $rightContainer : JQuery;
        private leftGraph: GUI.ProcessGraphUI;
        private rightGraph: GUI.ProcessGraphUI;
        private dgGame : BisimulationGame; // make generic with DgGame isntead of BisimulationGame
        
        constructor(container : string, button : string) {
            super(container, button);

            this.project = Project.getInstance();

            this.$gameType = $("#game-type");
            this.$playerType = $("input[name=player-type]");
            this.$leftProcessList = $("#game-left-process");
            this.$rightProcessList = $("#game-right-process");
            this.$leftContainer = $("#game-left-canvas");
            this.$rightContainer = $("#game-right-canvas");

            var options = {repulsion: 100, stiffness: 800, friction: 0.5};
            this.leftGraph = new GUI.ArborGraph(new Renderer(<HTMLCanvasElement> $("#game-left-canvas > canvas")[0]), options);
            this.rightGraph = new GUI.ArborGraph(new Renderer(<HTMLCanvasElement> $("#game-right-canvas > canvas")[0]), options);

            this.$gameType.add(this.$playerType).add(this.$leftProcessList).add(this.$rightProcessList).on("change", () => this.newGame());
        }

        public onShow(configuration? : any) : void {
            $(window).on("resize", () => this.resize());
            this.resize();

            if (this.project.getChanged()) {
                this.graph = this.project.getGraph();
                this.displayOptions();
                this.newGame();
            }
        }

        public onHide() : void {
            $(window).off("resize");
            this.dgGame.stopGame();
        }

        private displayOptions() : void {
            var processes = this.graph.getNamedProcesses().reverse();
            
            this.$leftProcessList.empty();
            this.$rightProcessList.empty();

            for (var i = 0; i < processes.length; i++) {
                this.$leftProcessList.append($("<option></option>").append(processes[i]));
                this.$rightProcessList.append($("<option></option>").append(processes[i]));
            }

            // Set second option as default selection for the right process.
            this.$rightProcessList.find("option:nth-child(2)").prop("selected", true);
        }

        private getOptions() : any {           
            return {
                gameType: this.$gameType.val(),
                playerType: this.$playerType.filter(":checked").val(),
                leftProcess: this.$leftProcessList.val(),
                rightProcess: this.$rightProcessList.val()
            };
        }

        private newGame() : void {
            var options = this.getOptions();
            this.succGen = CCS.getSuccGenerator(this.graph, {succGen: options.gameType, reduce: true});
            this.draw(this.graph.processByName(options.leftProcess), this.leftGraph);
            this.draw(this.graph.processByName(options.rightProcess), this.rightGraph);
            
            this.makeDgGame(options);
        }
        
        private makeDgGame(options : any) {
            if (this.dgGame != undefined)
                this.dgGame.stopGame();
            
            var attackerSuccessorGenerator : CCS.SuccessorGenerator = CCS.getSuccGenerator(this.graph, {succGen: "strong", reduce: false});
            var defenderSuccessorGenerator : CCS.SuccessorGenerator = CCS.getSuccGenerator(this.graph, {succGen: options.gameType, reduce: false});
            
            this.dgGame = new BisimulationGame(this.graph, attackerSuccessorGenerator, defenderSuccessorGenerator, options.leftProcess, options.rightProcess);
            
            var attacker : Player;
            var defender : Player;
            
            // TODO make human player
            if (this.dgGame.isBisimilar()) {
                defender = new Computer(Player.Player1Color, PlayType.Defender);
                attacker = new Computer(Player.Player2Color, PlayType.Attacker);
            } else {
                defender = new Computer(Player.Player1Color, PlayType.Defender);
                attacker = new Computer(Player.Player2Color, PlayType.Attacker);
            }
            
            this.dgGame.setPlayers(attacker, defender);
            this.dgGame.startGame();
        }

        private draw(process : CCS.Process, graph : GUI.ProcessGraphUI) : void {
            this.clear(graph);

            var allTransitions = this.expandBFS(process, 1000);

            for (var sourceId in allTransitions) {
                graph.showProcess(sourceId, {label: this.labelFor(this.graph.processById(sourceId))});

                allTransitions[sourceId].forEach(t => {
                    graph.showProcess(t.targetProcess.id, {label: this.labelFor(this.graph.processById(t.targetProcess.id))});
                    graph.showTransitions(sourceId, t.targetProcess.id, [{label: t.action.toString()}]);
                });
            }

            graph.setSelected(process.id.toString());
        }

        private clear(graph : GUI.ProcessGraphUI) : void {
            graph.clearAll();
        }

        private expandBFS(process : ccs.Process, maxDepth) {
            var result = {},
                queue = [[1, process]], //non-emptying array as queue.
                depth, qIdx, fromProcess, transitions;
            for (qIdx = 0; qIdx < queue.length; qIdx++) {
                depth = queue[qIdx][0];
                fromProcess = queue[qIdx][1];
                result[fromProcess.id] = transitions = this.succGen.getSuccessors(fromProcess.id);
                transitions.forEach(t => {
                    if (!result[t.targetProcess.id] && depth < maxDepth) {
                        queue.push([depth + 1, t.targetProcess]);
                    }
                });
            }
            return result;
        }

        private labelFor(process : ccs.Process) : string {
            return (process instanceof ccs.NamedProcess) ? process.name : "" + process.id;
        }

        private resize() : void {
            this.$leftContainer.height(this.$leftContainer.width());
            this.$rightContainer.height(this.$rightContainer.width());
        }
    }
    
    
    enum PlayType { Attacker, Defender }
    enum Move { Right, Left }

    class DgGame {
        
        protected dependencyGraph : dg.DependencyGraph;
        protected marking : dg.LevelMarking;
        
        //private htmlNotationVisitor : Traverse.TooltipHtmlCCSNotationVisitor;
        private htmlNotationVisitor : Traverse.CCSNotationVisitor;
        
        private gameLog : GameLog = new GameLog(true);
        
        protected attacker : Player;
        protected defender : Player;
        private step : number = 0;
        
        protected lastMove : Move;
        protected lastAction : string;
        protected currentNodeId : any = 0;
        
        constructor(protected graph : CCS.Graph, attackerSuccessorGen : CCS.SuccessorGenerator, defenderSuccesorGen : CCS.SuccessorGenerator) {
            //this.htmlNotationVisitor = new Traverse.TooltipHtmlCCSNotationVisitor();
            this.htmlNotationVisitor = new Traverse.CCSNotationVisitor();
            
            // create the dependency graph
            this.dependencyGraph = this.createDependencyGraph(this.graph, attackerSuccessorGen, defenderSuccesorGen);
            
            // create markings
            this.marking = this.createMarking();
        }
        
        public getRound() : number {
            return this.step / 2 + 1;
        }
        
        public getWinner() : Player {
            throw "Abstract method. Not implemented.";
            return undefined;
        }
        
        public isWinner(player : Player) : boolean {
            return this.getWinner() === player;
        }
        
        public getLastMove() : Move {
            return this.lastMove;
        }
        
        public getBestWinningAttack(choices : any) : any {
            // consider adding this method to DepedencyGraph interface
            throw "Abstract method. Not implemented.";
            return undefined;
        }
        
        public getWinningDefend(choices : any) : any {
            // consider adding this method to DepedencyGraph interface
            throw "Abstract method. Not implemented.";
            return undefined;
        }
        
        public getCurrentChoices(playType : PlayType) : any {
            // consider adding this method to DepedencyGraph interface
            throw "Abstract method. Not implemented.";
            return undefined;
        }
        
        public startGame() : void {
            if (this.attacker == undefined || this.defender == undefined)
                throw "No players in game.";
            this.currentNodeId = 0;
            this.step = 0;
            
            this.attacker.prepareTurn(this.getCurrentChoices(PlayType.Attacker), this);
        }
        
        public stopGame() : void {
            // tell players to abort their prepared play
            this.attacker.abortPlay();
            this.defender.abortPlay();
            
            //TODO consider rendering the dgGame unplayable now by some flag
        }
        
        public setPlayers(attacker : Player, defender : Player) {
            if (attacker.getPlayType() == defender.getPlayType()) {
                throw "Cannot make game with two " + attacker.playTypeStr() + "s";
            }
            else if (attacker.getPlayType() != PlayType.Attacker ||
                defender.getPlayType() != PlayType.Defender) {
                throw "setPlayer(...) : First argument must be attacker and second defender";
            }
            
            this.attacker = attacker;
            this.defender = defender;
        }
        
        protected createDependencyGraph(graph : CCS.Graph, attackerSuccessorGen : CCS.SuccessorGenerator, defenderSuccesorGen : CCS.SuccessorGenerator) : dg.DependencyGraph { // abstract
            throw "Abstract method. Not implemented.";
            return undefined;
        }
        
        protected createMarking() : dg.LevelMarking { // abstract
            throw "Abstract method. Not implemented.";
            return undefined;
        }
        
        public play(player : Player, destinationProcess : any, nextNode : any, action : string = this.lastAction, move? : Move) {
            this.step++;
            var destinationHtml : string = this.htmlNotationVisitor.visit(destinationProcess);
            
            // change the current node id to the next
            this.currentNodeId = nextNode;
            
            if (player.getPlayType() == PlayType.Attacker) {
                this.gameLog.printRound(this.getRound());
                this.gameLog.printPlay(player, action, destinationHtml);
                
                this.lastAction = action;
                this.lastMove = move;
                
                this.preparePlayer(this.defender);
            } else {
                this.gameLog.printPlay(player, action, destinationHtml);
                
                // the play is a defense, flip the saved last move
                this.lastMove = this.lastMove == Move.Right ? Move.Left : Move.Right;
                
                this.preparePlayer(this.attacker);
            }
        }
        
        private preparePlayer(player : Player) {
            var choices : any = this.getCurrentChoices(player.getPlayType());
            
            if (choices.length === 0) {
                // the player to be prepared cannot make a move
                // the player to prepare has lost, announce it
                this.gameLog.printWinner(player == this.attacker ? this.defender : this.attacker);
                
                // stop game
                this.stopGame();
            } else {
                // tell the player to prepare for his turn
                player.prepareTurn(choices, this);
            }
        }
    }

    class BisimulationGame extends DgGame {
        
        private leftProcessName : string;
        private rightProcessName : string;
        private bisimulationDG : dg.BisimulationDG;
        private bisimilar : boolean;
        
        constructor(graph : CCS.Graph, attackerSuccessorGen : CCS.SuccessorGenerator, defenderSuccesorGen : CCS.SuccessorGenerator, leftProcessName : string, rightProcessName : string) {
            // stupid compiler
            this.leftProcessName = leftProcessName;
            this.rightProcessName = rightProcessName;
            
            super(graph, attackerSuccessorGen, defenderSuccesorGen); // creates dependency graph and marking
        }
        
        public isBisimilar() : boolean {
            return this.bisimilar;
        }
        
        protected createDependencyGraph(graph : CCS.Graph, attackerSuccessorGen : CCS.SuccessorGenerator, defenderSuccesorGen : CCS.SuccessorGenerator) : dg.DependencyGraph {
            var leftProcess : any  = graph.processByName(this.leftProcessName);
            var rightProcess : any = graph.processByName(this.rightProcessName);
            
            return this.bisimulationDG = new dg.BisimulationDG(attackerSuccessorGen, defenderSuccesorGen, leftProcess.id, rightProcess.id);
        }
        
        public getWinner() : Player {
            return this.bisimilar ? this.defender : this.attacker;
        }
        
        protected createMarking() : dg.LevelMarking {
            var marking : dg.LevelMarking = dg.solveDgGlobalLevel(this.dependencyGraph);
            this.bisimilar = marking.getMarking(0) === marking.ZERO;
            return marking;
        }
        
        public getBestWinningAttack(choices : any) : any {
            if (choices.length == 0)
                throw "No choices for attacker";
            
            var bestCandidateIndex = 0;
            var bestCandidateLevel = Infinity;
            var ownLevel = this.marking.getLevel(this.currentNodeId);
            
            choices.forEach((option, i) => {
                var targetNodeLevel = this.marking.getLevel(option.nextNode);
                
                if (targetNodeLevel < ownLevel && targetNodeLevel < bestCandidateLevel) {
                    bestCandidateLevel = targetNodeLevel;
                    bestCandidateIndex = i;
                }
            });
            
            return choices[bestCandidateIndex];
        }
        
        public getWinningDefend(choices : any) : any {
            for (var i = 0; i < choices.length; i++) {
                if (this.marking.getMarking(choices[i].nextNode) === this.marking.ZERO) {
                    return choices[i];
                }
            }
            
            throw "No defender moves";
        }
        
        public getCurrentChoices(playType : PlayType) : any {
            if (playType == PlayType.Attacker)
                return this.bisimulationDG.getAttackerOptions(this.currentNodeId);
            else
                return this.bisimulationDG.getDefenderOptions(this.currentNodeId);
        }
    }

    class Player { // abstract
        
        static Player1Color : string = "#e74c3c";
        static Player2Color : string = "#2980b9";
        static HumanColor : string = Player.Player1Color;
        static ComputerColor : string = Player.Player2Color;
        
        constructor(protected playerColor : string, private playType : PlayType) {
            
        }
        
        public prepareTurn(choices : any, game : DgGame) : void {
            // input list of processes
            switch (this.playType)
            {
                case PlayType.Attacker: {
                    this.prepareAttack(choices, game);
                    break;
                }
                case PlayType.Defender: {
                    this.prepareDefend(choices, game);
                    break;
                }
            }
        }
        
        public getColor() : string {
            return this.playerColor;
        }
        
        public getPlayType() : PlayType {
            return this.playType;
        }
        
        protected prepareAttack(choices : any, game : DgGame) : void {
            throw "Abstract method. Not implemented.";
        }
        
        protected prepareDefend(choices : any, game : DgGame) : void {
            throw "Abstract method. Not implemented.";
        }
        
        public abortPlay() : void {
            // empty, override
        }
        
        public playTypeStr() : string {
            return this.playType == PlayType.Attacker ? "ATTACKER" : this.playType == PlayType.Defender ? "DEFENDER" : "UNKNOWN";
        }
    }
    
    class Human extends Player {
        
        constructor(playerColor : string, playType : PlayType) {
            super(playerColor, playType);
        }
        
        protected prepareAttack(choices : any, game : DgGame) : void {
            
        }
        
        protected prepareDefend(choices : any, game : DgGame) : void {
            
        }
    }

    class Computer extends Player {
        
        static Delay : number = 2000;
        
        private delayedPlay;
        
        constructor(playerColor : string, playType : PlayType) {
            super(playerColor, playType);
        }
        
        public abortPlay() : void {
            clearTimeout(this.delayedPlay);
        }
        
        protected prepareAttack(choices : any, game : DgGame) : void {
            // select strategy
            if (game.isWinner(this))
                this.delayedPlay = setTimeout( () => this.winningAttack(choices, game), Computer.Delay);
            else
                this.delayedPlay = setTimeout( () => this.losingAttack(choices, game), Computer.Delay);
        }
        
        protected prepareDefend(choices : any, game : DgGame) : void {
            // select strategy
            if (game.isWinner(this))
                this.delayedPlay = setTimeout( () => this.winningDefend(choices, game), Computer.Delay);
            else
                this.delayedPlay = setTimeout( () => this.losingDefend(choices, game), Computer.Delay);
        }
        
        private losingAttack(choices : any, game : DgGame) : void {
            // play random
            var random : number = this.random(choices.length);
            
            var move : Move = choices[random].move == 1 ? Move.Left : Move.Right; // 1: left, 2: right
            
            game.play(this, choices[random].targetProcess, choices[random].nextNode, choices[random].action, move);
        }
        
        private winningAttack(choices : any, game : DgGame) : void {
            var choice : any = game.getBestWinningAttack(choices);
            var move : Move = choice.move == 1 ? Move.Left : Move.Right; // 1: left, 2: right
            
            game.play(this, choice.targetProcess, choice.nextNode, choice.action, move);
        }
        
        private losingDefend(choices : any, game : DgGame) : void {
            // play random
            var random : number = this.random(choices.length);
            game.play(this, choices[random].targetProcess, choices[random].nextNode);
        }
        
        private winningDefend(choices : any, game : DgGame) : void {
            var choice = game.getWinningDefend(choices);
            game.play(this, choice.targetProcess, choice.nextNode);
        }
        
        private random(max) : number {
            // random integer between 0 and max
            return Math.floor((Math.random() * max));
        }
    }

    class GameLog {
        
        private $list : any;
        
        constructor(private printConsole : boolean = false) {
            this.$list = $("#game-console").find("ul");
            this.$list.empty();
        }
        
        public print(line : string, margin : number = 0) : void {
            if (this.printConsole) {
                var marginStr : string = "";
                for (var i = 0; i < margin/5; i++)
                    marginStr += " ";
                console.log(marginStr + line);
            }
                
            this.$list.append("<li style='margin-left: " + margin + "px'>" + line + "</li>");
        }
        
        public printRound(round : number) : void {
            this.print("Round " + Math.floor(round) + ":");
        }
        
        public printPlay(player : Player, action : string, destination : string) : void {
            this.print(this.getColoredPlayer(player) + ": " + "--- "+action+" --->   " + destination, 20);
        }
        
        public printWinner(winner : Player) : void {
            this.print(this.getColoredPlayer(winner) + " wins.");
        }
        
        private getColoredPlayer(player : Player) : string {
            return player.playTypeStr();
            // return "<span style='color: "+player.getColor()+"'>" + player.playTypeStr() + "</span>";
        }
    }
}
