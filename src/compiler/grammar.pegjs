{
  'use strict';

  function filledArray(count, value) {
    var result = new Array(count), i;

    for (i = 0; i < count; i++) {
      result[i] = value;
    }

    return result;
  }

  function extractOptional(optional, index) {
    return optional ? optional[index] : null;
  }

  function extractList(list, index) {
    var result = new Array(list.length), i;

    for (i = 0; i < list.length; i++) {
      result[i] = list[i][index];
    }

    return result;
  }

  function buildList(first, rest, index) {
    return [first].concat(extractList(rest, index));
  }

  function buildTree(first, rest, builder) {
    var result = first, i;

    for (i = 0; i < rest.length; i++) {
      result = builder(result, rest[i]);
    }

    return result;
  }

  function optionalList(value) {
    return value !== null ? value : [];
  }

  const NodeKind = {
    assignmentExpression: "assignmentExpression",
    binaryExpression: "binaryExpression",
    breakStatement: "breakStatement",
    blockStatement: "blockStatement",
    callExpression: "callExpression",
    caseClause: "caseClause",
    expressionStatement: "expressionStatement",
    functionDeclarationStatement: "functionDeclarationStatement",
    forStatement: "forStatement",
    identifier: "identifier",
    ifStatement: "ifStatement",
    integerLiteral: "integerLiteral",
    memberExpression: "memberExpression",
    parameter: "parameter",
    returnStatement: "returnStatement",
    sourceFile: "sourceFile",
    stringLiteral: "stringLiteral",
    switchStatement: "switchStatement",
    unaryExpression: "unaryExpression",
    variableDeclarationStatement: "variableDeclarationStatement",
    variableDeclarator: "variableDeclarator",
    whileStatement: "whileStatement",
  };

  const node = (kind, self) => { self.kind = kind; /*self.loc = location();*/ return self; }

  const ast = {
    assignmentExpression: (left, op, right) => node(NodeKind.assignmentExpression, { op, children: { left, right }}),
    blockStatement: (body) => node(NodeKind.blockStatement, { children: { body }}),
    binaryExpression: (head, tail) => tail.reduce((result, element) => node(NodeKind.binaryExpression, { operator: element[1], children: { left: result, right: element[3] }}), head),
    breakStatement: () => node(NodeKind.breakStatement, {}),
    callExpression: (id, args) => node(NodeKind.callExpression, { children: { id, args }}),
    caseClause: (test, consequent) => node(NodeKind.caseClause, { children: { test, consequent }}),
    expressionStatement: (expression) => node(NodeKind.expressionStatement, { children: { expression }}),
    forStatement: (init, test, update, body) => node(NodeKind.forStatement, { children: { init, test, update, body }}),
    functionDeclarationStatement: (id, params, body) => node(NodeKind.functionDeclarationStatement, { children: { id, params, body }}),
    identifier: (name) => node(NodeKind.identifier, { name }),
    ifStatement: (test, consequent, alternate) => node(NodeKind.ifStatement, { children: { test, consequent, alternate }}),
    integerLiteral: (digits, base) => node(NodeKind.integerLiteral, { value: parseInt(digits, base) }),
    memberExpression: (owner, element, computed) => node(NodeKind.memberExpression, { children: { owner, element }, computed }),
    parameter: (id, defaultValue) => node(NodeKind.parameter, { children: { id, defaultValue }}),
    sourceFile: (body) => node(NodeKind.sourceFile, { children: { body }}),
    returnStatement: (argument) => node(NodeKind.returnStatement, { children: { argument }}),
    stringLiteral: (value) => node(NodeKind.stringLiteral, { value }),
    switchStatement: (discriminant, cases) => node(NodeKind.switchStatement, { children: { discriminant, cases }}),
    unaryExpression: (operator, operand, isPostfix) => node(NodeKind.unaryExpression, { operator, isPostfix, children: { operand }}),
    variableDeclarationStatement: (declarations, isConstant) => node(NodeKind.variableDeclarationStatement, { children: { declarations }, isConstant }),
    variableDeclarator: (id, initializer) => node(NodeKind.variableDeclarator, { children: { id, initializer }}),
    whileStatement: (test, body) => node(NodeKind.whileStatement, { children: { test, body }}),
  }
}

Start
  = __ sourceFile:SourceFile __ { return sourceFile; }

SourceCharacter
  = .

WhiteSpace "whitespace"
  = "\t"
  / " "

LineTerminator
  = [\n\r]

LineTerminatorSequence "end of line"
  = "\n"
  / "\r\n"
  / "\r"

Comment "comment"
  = MultiLineComment
  / SingleLineComment

MultiLineComment
  = "/*" (!"*/" SourceCharacter)* "*/"

MultiLineCommentNoLineTerminator
  = "/*" (!("*/" / LineTerminator) SourceCharacter)* "*/"

SingleLineComment
  = "//" (!LineTerminator SourceCharacter)*

Identifier
  = !ReservedWord name:IdentifierName { return name; }

IdentifierName "identifier"
  = first:IdentifierStart rest:IdentifierPart* {
      return ast.identifier(first + rest.join(""));
    }

IdentifierStart
  = [a-z]i
  / "_"

IdentifierPart
  = IdentifierStart
  / [0-9]

ReservedWord
  = Keyword
  / BooleanLiteral

Keyword
  = ReturnToken
  / LetToken
  / ConstToken
  / IfToken
  / ElseToken
  / ForToken
  / FunctionToken
  / BreakToken
  / ContinueToken
  / DebuggerToken
  / WhileToken
  / SwitchToken
  / CaseToken
  / DefaultToken

Literal
  = BooleanLiteral
  / IntegerLiteral
  / StringLiteral

BooleanLiteral
  = TrueToken  { return ast.integerLiteral(1); }
  / FalseToken { return ast.integerLiteral(0); }

IntegerLiteral "number"
  = literal:HexIntegerLiteral !(IdentifierStart / DecimalDigit) {
      return literal;
    }
  / literal:DecimalIntegerLiteral !(IdentifierStart / DecimalDigit) {
      return literal;
    }

DecimalIntegerLiteral
  = "0"                         { return ast.integerLiteral(text(), 10) }
  / NonZeroDigit DecimalDigit*  { return ast.integerLiteral(text(), 10) }

DecimalDigit
  = [0-9]

NonZeroDigit
  = [1-9]

HexIntegerLiteral
  = "0x"i digits:$HexDigit+ {
    return ast.integerLiteral(text(), 16);
  }

HexDigit
  = [0-9a-f]i

StringLiteral "string"
  = '"' chars:DoubleStringCharacter* '"' {
      return ast.stringLiteral(chars.join(''));
    }
  / "'" chars:SingleStringCharacter* "'" {
      return ast.stringLiteral(chars.join(''));
    }

DoubleStringCharacter
  = !('"' / "\\" / LineTerminator) SourceCharacter { return text(); }
  / "\\" sequence:EscapeSequence { return sequence; }
  / LineContinuation
  / LineTerminator __ { return ast.StringLiteral.NewLine(text()); }

SingleStringCharacter
  = !("'" / "\\" / LineTerminator) SourceCharacter { return text(); }
  / "\\" sequence:EscapeSequence { return sequence; }
  / LineContinuation
  / LineTerminator __ { return ast.StringLiteral.NewLine(text()); }

LineContinuation
  = "\\" LineTerminatorSequence { return ""; }

EscapeSequence
  = ExpressionSequence
  / CharacterEscapeSequence
  / "0" !DecimalDigit { return "\0"; }
  / HexEscapeSequence
  / UnicodeEscapeSequence

CharacterEscapeSequence
  = SingleEscapeCharacter
  / NonEscapeCharacter

SingleEscapeCharacter
  = "'"
  / '"'
  / "\\"
  / "b"  { return "\b";   }
  / "f"  { return "\f";   }
  / "n"  { return "\n";   }
  / "r"  { return "\r";   }
  / "t"  { return "\t";   }
  / "v"  { return "\x0B"; }

NonEscapeCharacter
  = !(EscapeCharacter / LineTerminator) SourceCharacter { return text(); }

EscapeCharacter
  = SingleEscapeCharacter
  / DecimalDigit
  / "x"
  / "u"

HexEscapeSequence
  = "x" digits:$(HexDigit HexDigit) {
      return String.fromCharCode(parseInt(digits, 16));
    }

UnicodeEscapeSequence
  = "u" digits:$(HexDigit HexDigit HexDigit HexDigit) {
      return String.fromCharCode(parseInt(digits, 16));
    }

ExpressionSequence
  = "(" expression:Expression ")" {
      return expression;
    }

/* Tokens */

ReturnToken       = "return"      !IdentifierPart
LetToken          = "let"         !IdentifierPart
ConstToken        = "const"       !IdentifierPart
IfToken           = "if"          !IdentifierPart
ElseToken         = "else"        !IdentifierPart
ForToken          = "for"         !IdentifierPart
FunctionToken     = "function"    !IdentifierPart
TrueToken         = "true"        !IdentifierPart
FalseToken        = "false"       !IdentifierPart
BreakToken        = "break"       !IdentifierPart
ContinueToken     = "continue"    !IdentifierPart
DebuggerToken     = "debugger"    !IdentifierPart
WhileToken        = "while"       !IdentifierPart
SwitchToken       = "switch"      !IdentifierPart
CaseToken         = "case"        !IdentifierPart
DefaultToken      = "default"     !IdentifierPart
DoToken           = "do"          !IdentifierPart

__
  = (WhiteSpace / LineTerminatorSequence / Comment)*

_
  = (WhiteSpace / MultiLineCommentNoLineTerminator)*

// Automatic semicolon insertion
EOS "end of statement"
  = __ ";"
  / _ SingleLineComment? LineTerminatorSequence
  / _ &"}"
  / __ EOF

EOF "end of file"
  = !.

SourceFile
  = body:StatementList? {
      return ast.sourceFile(optionalList(body));
    }

StatementList
  = first:Statement rest:(__ Statement)* {
      return buildList(first, rest, 1);
    }

Statement
  = Block
  / VariableStatement
  / FunctionDeclaration
  / IfStatement
  / PushStatement
  / ExpressionStatement
  / ReturnStatement
  / ForStatement
  / BreakStatement
  / ContinueStatement
  / DebuggerStatement
  / WhileStatement
  / SwitchStatement
  / DoWhileStatement

Block
  = "{" __ body:(StatementList __)? "}" {
      return ast.blockStatement(optionalList(extractOptional(body, 0)));
    }

VariableStatement
  = LetToken __ declarations:VariableDeclarationList EOS { return ast.variableDeclarationStatement(declarations, /* isConstant = */ false); }
  / ConstToken __ declarations:VariableDeclarationList EOS { return ast.variableDeclarationStatement(declarations, /* isConstant = */ true); }

VariableDeclarationList
  = first:VariableDeclaration rest:(__ "," __ VariableDeclaration)* {
      return buildList(first, rest, 3);
    }

VariableDeclaration
  = id:Identifier init:(__ Initializer)? {
      return ast.variableDeclarator(id, extractOptional(init, 1));
    }
  / id:Pattern init:(__ Initializer)? {
    return ast.variableDeclarator(id, extractOptional(init, 1));
  }

Initializer
  = "=" !"=" __ expression:AssignmentExpression { return expression; }

FunctionDeclaration
  = FunctionToken __ id:Identifier __
    "(" __ params:(FormalParameterList __)? ")" __
    __ body:Block __
    {
      return ast.functionDeclarationStatement(id, optionalList(extractOptional(params, 0)), body);
    }

FormalParameterList
  = first:FormalParameter rest:(__ "," __ FormalParameter)* {
      return buildList(first, rest, 3);
    }

FormalParameter
  = id:Identifier __ "=" __ defaultValue:Expression {
    return ast.parameter(id, defaultValue);
  }
  / id:Identifier {
    return ast.parameter(id, null);
  }

IfStatement
  = IfToken __ test:Expression __
    consequent:Statement __
    ElseToken __
    alternate:Statement
    {
      return ast.ifStatement(test, consequent, alternate);
    }
  / IfToken __ test:Expression __
    consequent:Statement {
      return ast.ifStatement(test, consequent, null);
    }

ReturnStatement
  = ReturnToken EOS {
      return ast.returnStatement(null);
    }
  / ReturnToken _ argument:Expression EOS {
      return ast.returnStatement(argument);
    }

BreakStatement
  = BreakToken EOS {
      return ast.breakStatement();
    }

ContinueStatement
  = ContinueToken EOS {
      return ast.continueStatement();
    }

DoWhileStatement
  = DoToken __
    body:Statement __
    WhileToken __ test:Expression EOS {
      return ast.doWhileStatement(test, body);
    }

PushStatement
  = left:LeftHandSideExpression __ "<-" __ right:AssignmentExpression EOS {
      return ast.pushStatement(left, right);
  }

DebuggerStatement
  = DebuggerToken EOS {
      return ast.debuggerStatement();
    }

WhileStatement
  = WhileToken __ test:Expression __
    body:Statement {
      return ast.whileStatement(test, body);
    }

SwitchStatement
  = SwitchToken __ "(" __ discriminant:Expression __ ")" __
    cases:CaseBlock
    {
      return ast.switchStatement(discriminant, cases);
    }

CaseBlock
  = "{" __ clauses:(CaseClauses __)? "}" {
      return optionalList(extractOptional(clauses, 0));
    }
  / "{" __
    before:(CaseClauses __)?
    default_:DefaultClause __
    after:(CaseClauses __)? "}"
    {
      return optionalList(extractOptional(before, 0))
        .concat(default_)
        .concat(optionalList(extractOptional(after, 0)));
    }

CaseClauses
  = head:CaseClause tail:(__ CaseClause)* { return buildList(head, tail, 1); }

CaseClause
  = CaseToken __ test:Expression __ ":" consequent:(__ StatementList)? {
      return ast.caseClause(test, optionalList(extractOptional(consequent, 1)));
    }

DefaultClause
  = DefaultToken __ ":" consequent:(__ StatementList)? {
      return ast.caseClause(null, optionalList(extractOptional(consequent, 1)));
    }

ForStatement
  = ForToken __ "(" __
    LetToken __ declarations:VariableDeclarationList __ ";" __
    test:(Expression __)? ";" __
    update:(!("{" __ "}") Expression __)?
    __ ")" __
    body:Statement {
      return ast.forStatement(
        ast.variableDeclarationStatement(declarations),
        extractOptional(test, 0),
        extractOptional(update, 1),
        body
      );
    }
  / ForToken __ "(" __
    init:(Expression __)? ";" __
    test:(Expression __)? ";" __
    update:(!("{" __ "}") Expression __)?
    __ ")" __
    body:Statement {
      return ast.forStatement(
        extractOptional(init, 0),
        extractOptional(test, 0),
        extractOptional(update, 1),
        body
      );
    }

ExpressionStatement
  = !("{" / FunctionToken) expression:Expression EOS {
      return ast.expressionStatement(expression);
    }

AssignmentExpression
  = left:Pattern __ "=" !"=" __ right:AssignmentExpression {
      return ast.assignmentExpression(
        left, "=", right);
  }
  / left:ConditionalExpression
    assignment:(__ operator:AssignmentOperator __
    right:AssignmentExpression)? {
      if (!assignment) {
        return left;
      }

      return ast.assignmentExpression(
        left,
        extractOptional(assignment, 1),
        extractOptional(assignment, 3));
    }

AssignmentOperator
  = "=" !"=" { return "=" }
  / "*="
  / "/="
  / "%="
  / "+="
  / "-="
  / "<<="
  / ">>="
  / "&="
  / "^="
  / "|="

ConditionalExpression
  = consequent:LogicalORExpression __
    condition:(IfToken __ LogicalORExpression __
    ElseToken __ LogicalORExpression)? {
      if (condition) {
        var test = extractOptional(condition, 2);
        var alternate = extractOptional(condition, 6);

        return ast.conditionalExpression(test, consequent, alternate);
      } else {
        return consequent;
      }
    }

LogicalORExpression
  = first:LogicalANDExpression
    rest:(__ LogicalOROperator __ LogicalANDExpression)*
    { return ast.binaryExpression(first, rest); }

LogicalOROperator
  = "||" { return "||"; }

LogicalANDExpression
  = first:BitwiseORExpression
    rest:(__ LogicalANDOperator __ BitwiseORExpression)*
    { return ast.binaryExpression(first, rest); }

LogicalANDOperator
  = "&&" { return "&&"; }

BitwiseORExpression
  = first:BitwiseXORExpression
    rest:(__ BitwiseOROperator __ BitwiseXORExpression)*
    { return ast.binaryExpression(first, rest); }

BitwiseOROperator
  = $("|" ![|=])

BitwiseXORExpression
  = first:BitwiseANDExpression
    rest:(__ BitwiseXOROperator __ BitwiseANDExpression)*
    { return ast.binaryExpression(first, rest); }

BitwiseXOROperator
  = $("^" !"=")

BitwiseANDExpression
  = first:EqualityExpression
    rest:(__ BitwiseANDOperator __ EqualityExpression)*
    { return ast.binaryExpression(first, rest); }

BitwiseANDOperator
  = $("&" ![&=])

EqualityExpression
  = first:RelationalExpression
    rest:(__ EqualityOperator __ RelationalExpression)*
    { return ast.binaryExpression(first, rest); }

EqualityOperator
  = "=="
  / "!="

RelationalExpression
  = first:ShiftExpression
    rest:(__ RelationalOperator __ ShiftExpression)*
    { return ast.binaryExpression(first, rest); }

RelationalOperator
  = "<="
  / ">="
  / $("<" !"<")
  / $(">" !">")

ShiftExpression
  = first:AdditiveExpression
    rest:(__ ShiftOperator __ AdditiveExpression)*
    { return ast.binaryExpression(first, rest); }

ShiftOperator
  = $("<<"  !"=")
  / $(">>"  !"=")

AdditiveExpression
  = first:MultiplicativeExpression
    rest:(__ AdditiveOperator __ MultiplicativeExpression)*
    { return ast.binaryExpression(first, rest); }

AdditiveOperator
  = $("+" ![+=])
  / $("-" ![-=])

MultiplicativeExpression
  = first:UnaryExpression
    rest:(__ MultiplicativeOperator __ UnaryExpression)*
    { return ast.binaryExpression(first, rest); }

MultiplicativeOperator
  = $("*" ![*=])
  / $("/" !"=")
  / $("%" ![%=])

UnaryExpression
  = operator:UnaryOperator __ argument:PostfixExpression {
      if (operator === "++" || operator === "--" || operator === '-') {
        return ast.unaryExpression(operator, argument, /* isPostfix: */ false);
      } else {
        return ast.unaryExpression(operator, argument, /* isPostfix: */ true);
      }
    }
  / PostfixExpression

UnaryOperator
  = "++"
  / "--"
  / $("-" !"=")
  / "!"

PostfixExpression
  = argument:ExistentialExpression _ operator:PostfixOperator? {
      if (operator) {
        return ast.unaryExpression(operator, argument, /* isPostfix: */ true);
      } else {
        return argument;
      }
    }

PostfixOperator
  = "++"
  / "--"

ExistentialExpression
  = argument:LeftHandSideExpression operator:"?"? !"?" {
    if (operator) {
      return ast.existentialExpression(argument);
    } else {
      return argument;
    }
  }

LeftHandSideExpression
  = CallExpression

CallExpression
  = first:(
      callee:MemberExpression call:(__ args:Arguments)? {
        if (!call) {
          return callee;
        }

        return ast.callExpression(callee, extractOptional(call, 1));
      }
    )
    rest:(
        __ args:Arguments {
          return {
            type: "CallExpression",
            arguments: args
          };
        }
      / __ "[" __ property:Expression __ "]" {
          return {
            type:     "MemberExpression",
            property: property,
            computed: true
          };
        }
      / __ "." !"." __ property:IdentifierName {
          return {
            type:     "MemberExpression",
            property: property,
            computed: false
          };
        }
    )*
    {
      return buildTree(first, rest, function(result, element) {
        if (element.type === "MemberExpression") {
          return ast.memberExpression(result, element.property, element.computed);
        } else if (element.type === "CallExpression") {
          return ast.callExpression(result, element.arguments);
        }
      });
    }

MemberExpression
  = first:(
        FunctionExpression
    )
    rest:(
        __ "[" __ property:Expression __ "]" {
          return {
            type: "MemberExpression",
            property: property,
            computed: true
          };
        }
      / __ "." !"." __ property:IdentifierName {
          return {
            type: "MemberExpression",
            property: property,
            computed: false
          };
        }
    )*
    {
      return buildTree(first, rest, function (result, element) {
        return ast.memberExpression(result, element.property, element.computed);
      });
    }

Arguments
  = "(" __ args:(ArgumentList __)? ")" {
      return optionalList(extractOptional(args, 0));
    }

ArgumentList
  = first:Argument rest:(__ "," __ Argument)* {
      return buildList(first, rest, 3);
    }

Argument
  = expression:AssignmentExpression __ "..." {
    return ast.splatExpression(expression);
  }
  / AssignmentExpression

FunctionExpression
  = "(" __ params:(FormalParameterList __)? ")"
    __ operator:FunctionExpressionOperator
    __ body:Block __
    {
      return ast.functionExpression(
        null,
        optionalList(extractOptional(params, 0)),
        body,
        null
      );
    }
  / "(" __ params:(FormalParameterList __)? ")"
    __ operator:FunctionExpressionOperator
    __ body:Expression __
    {
      return ast.functionExpression(
        null,
        optionalList(extractOptional(params, 0)),
        body,
        null
      );
    }
  / GlobalIdentifierExpression

FunctionExpressionOperator = "=>"

GlobalIdentifierExpression
  = "::" __ id:Identifier
    { return id.asGlobal(); }
  / PrimaryExpression

PrimaryExpression
  = Identifier
  / Literal
  / ArrayLiteral
  / ObjectLiteral
  / "(" __ expression:Expression __ ")" { return expression; }

Expression
  = expression:AssignmentExpression {
      return expression;
    }

ArrayLiteral
  = "[" __ elision:(Elision __)? "]" {
      return ast.arrayExpression(optionalList(extractOptional(elision, 0)));
    }
  / "[" __ elements:ElementList __ "]" {
      return ast.arrayExpression(elements);
    }
  / "[" __ elements:ElementList __ "," __ elision:(Elision __)? "]" {
      return ast.arrayExpression(elements.concat(optionalList(extractOptional(elision, 0))));
    }

ElementList
  = first:(
      elision:(Elision __)? element:AssignmentExpression {
        return optionalList(extractOptional(elision, 0)).concat(element);
      }
    )
    rest:(
      __ "," __ elision:(Elision __)? element:AssignmentExpression {
        return optionalList(extractOptional(elision, 0)).concat(element);
      }
    )*
    { return Array.prototype.concat.apply(first, rest); }

ArrayPattern
  = "[" __ elision:(Elision __)? "]" {
      return ast.arrayPattern(optionalList(extractOptional(elision, 0)));
    }
  / "[" __ elements:PatternElementList __ "]" {
      return ast.arrayPattern(elements);
    }
  / "[" __ elements:PatternElementList __ "," __ elision:(Elision __)? "]" {
      return ast.arrayPattern(elements.concat(optionalList(extractOptional(elision, 0))));
    }

PatternElementList
  = first:(
      elision:(Elision __)? element:PatternElement {
        return optionalList(extractOptional(elision, 0)).concat(element);
      }
    )
    rest:(
      __ "," __ elision:(Elision __)? element:PatternElement {
        return optionalList(extractOptional(elision, 0)).concat(element);
      }
    )*
    { return Array.prototype.concat.apply(first, rest); }

PatternElement
  = Identifier
  / ArrayPattern

Elision
  = "," commas:(__ ",")* { return filledArray(commas.length + 1, null); }

ObjectLiteral
  = "{" __ "}" {
       return  ast.ObjectExpression([]);
     }
  / "{" __ properties:PropertyNameAndValueList __ "}" {
       return ast.objectExpression(properties);
     }
  / "{" __ properties:PropertyNameAndValueList __ "," __ "}" {
       return ast.objectExpression(properties);
     }

PropertyNameAndValueList
  = first:PropertyAssignment rest:(__ "," __ PropertyAssignment)* {
      return buildList(first, rest, 3);
    }

PropertyAssignment
  = key:PropertyName __ ":" __ value:AssignmentExpression {
      return ast.property(key, value, false, false);
    }
  / key:PropertyName __
    "(" __ params:(FormalParameterList __)? ")"
    __ body:Block __
    {
      return ast.property(key, ast.FunctionExpression(
        null,
        optionalList(extractOptional(params, 0)),
        body,
        null
      ), false, true);
    }
  / key:IdentifierName {
    return ast.property(key, key, true, false);
  }

PropertyName
  = IdentifierName
  / StringLiteral
  / IntegerLiteral

ObjectPattern
  = "{" __ "}" {
       return  ast.ObjectPattern([]);
     }
  / "{" __ properties:PatternPropertyNameAndValueList __ "}" {
       return ast.objectPattern(properties);
     }
  / "{" __ properties:PatternPropertyNameAndValueList __ "," __ "}" {
       return ast.objectPattern(properties);
     }

PatternPropertyNameAndValueList
  = first:PatternPropertyAssignment rest:(__ "," __ PatternPropertyAssignment)* {
      return buildList(first, rest, 3);
    }

PatternPropertyAssignment
  = key:IdentifierName __ ":" __ value:IdentifierName {
      return ast.property(key, value, false, false);
    }
  / key:IdentifierName __ ":" __ value:ObjectPattern {
      return ast.property(key, value, false, false);
    }
  / key:IdentifierName {
    return ast.property(key, key, true, false);
  }

Pattern
  = ObjectPattern
  / ArrayPattern
