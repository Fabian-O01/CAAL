
{
	function extractLabelList(f, rest) {
		var restLabels;
		if (rest === undefined) return [f];
		restLabels = rest.map(function(syntax) {
			return syntax[3];
		});
		return [f].concat(restLabels)
	}

	function strFirstAndRest(first, rest) {
		return first + rest.join('');
	}

	var ccs = options.ccs;
	var g = options.graph || new ccs.Graph();
}

start
	= Program

//A program consists of lines only used for process assignments.
Program
	= statements:Statements _ { return g; }
	/ _ { return g; }

Statements = Statement Statements
		   / Statement

Statement = Assignment
		  / SetDeclaration

SetDeclaration = _ "set" _ name:Identifier _ "=" _ "{" _ labels:LabelList _ "}" _ ";" { return g.defineSet(name, labels); }

Assignment
	= (_ "agent"?) _ name:Identifier _ "=" _ P:Process _ ";" { return g.newNamedProcess(name, P); }

//The rules here are defined in the reverse order of their precedence.
//Either a given rule applies, eg. +, and everything to the left must have higher precedence,
// or there is no plus, in which cases it must still have higher predence.
Process = Summation

Summation
	= P:Composition _ "+" _ Q:Summation { return g.newSummationProcess(P, Q); }
	/ P:Composition { return P; }

Composition
	= P:ActionPrefix _ "|" _ Q:Composition { return g.newCompositionProcess(P, Q); }
	/ P:ActionPrefix { return P; }

ActionPrefix
	= action:Action _ "." _ P:ActionPrefix { return g.newActionPrefixProcess(action, P); }
	/ P:ReProcess { return P; }

ReProcess
	= P:ParenProcess _ "\\" _ "{" _ labels:LabelList? _ "}" { return g.newRestrictedProcess(P, new ccs.LabelSet(labels || [])); }
	/ P:ParenProcess _ "\\" _ setName:Identifier { return g.newRestrictedProcessOnSetName(P, setName); }
	/ P:ParenProcess _ "[" _ relabels:RelabellingList _ "]" { return g.newRelabelingProcess(P, new ccs.RelabellingSet(relabels || [])); }
	/ P:ParenProcess { return P; }

// Relabellings  [a/b, c/d]
RelabellingList
	= first:Relabel _ "," _ rest:RelabellingList { return [first].concat(rest); }
	/ relabel:Relabel { return [relabel]; }

Relabel
	= to:Label _ "/" _ from:Label { return {to: to, from: from}; }

// ( P ) for some process P
ParenProcess
	= "(" _ P:Process _ ")" { return P; }
	/ P:ConstantProcess { return P; }

// A constant process. Either the null process 0, or some process K.
ConstantProcess
	= "0" { return g.getNullProcess(); }
	/ K:Identifier { return g.referToNamedProcess(K); }

//Valid names for processes
Identifier
	= first:[A-Z] rest:IdentifierRest { return strFirstAndRest(first, rest); }

IdentifierRest
	= rest:[A-Za-z0-9?!_'\-#]*  { return rest; }

Action
	= [!'] label:Label { return new ccs.Action(label, true); }
	/ label:Label { return new ccs.Action(label, false); }

//Valid name for actions
Label
	= first:[a-z] rest:IdentifierRest { return strFirstAndRest(first, rest); }

LabelList
	= first:Label rest:(_ "," _ Label)* { return extractLabelList(first, rest); }

Whitespace
	= [ \t]

Comment = "*" [^\r\n]* "\r"? "\n"?

WhitespaceNewline
	= Whitespace
	/ Newline

//Useful utility
_ = WhitespaceNewline* Comment _
  / WhitespaceNewline*

Newline
	= "\r\n" / "\n" / "\r"
