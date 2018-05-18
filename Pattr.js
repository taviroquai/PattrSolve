const assign = require('lodash.assign');
const keys = require('lodash.keys');
const comb = require('js-combinatorics');

function Pattr(input) {

  // Init variables table
  const contents = input.replace(/\r?\n|\r/g, '');
  let sentences = contents.split(';');
  sentences = sentences.filter(i => i);
  const statements = sentences.filter(i => i && /\s(foreach|if|forany|while)\s/g.test(i) === false);
  const variables = {};

  /**
   * Parse statement
   * @param {String} stm
   * @return Object
   */
  function parseStatement(stm) {
    let t = [];
    if (!stm) return '';
    const clean = stm.replace(/^\s|\s$/g, '');
    if (!clean) return '';
    if (clean.indexOf('@') > -1) return '';

    const node = { op: '', children: [], val: null };

    if (/\sforany\s/g.test(clean)) {
      node.op = 'forany';
      t = clean.split(` ${node.op} `);
      node.children = t.map(parseStatement);
      return node;
    }
    if (/\sforeach\s/g.test(clean)) {
      node.op = 'foreach';
      t = clean.split(` ${node.op} `);
      node.children = t.map(parseStatement);
      return node;
    }
    if (/\swhile\s/g.test(clean)) {
      node.op = 'while';
      t = clean.split(` ${node.op} `);
      node.children = t.map(parseStatement);
      return node;
    }
    if (/\sif\s/g.test(clean)) {
      node.op = 'if';
      t = clean.split(` ${node.op} `);
      node.children = t.map(parseStatement);
      return node;
    }
    if (/\(([^()]|)*\)/g.test(stm)) {
      node.op = 'p';
      t = /\(([^()]|)*\)/g.exec(stm);
      let parts = [];
      parts.push(stm.substr(0, stm.indexOf(t[0])));
      parts.push(stm.substr(stm.indexOf(t[0]) + t[0].length));
      node.children = [
        (parts[0] || ''),
        parseStatement(t[0].substring(1, t[0].length-1)),
        (parts[1] || '')
      ];
      return node;
    }
    if (/^out\s/g.test(clean)) {
      node.op = 'out';
      t = /^out\s(.*)/.exec(clean);
      node.children = [t[1]].map(parseStatement);
      return node;
    }
    if (/^not\s/g.test(clean)) {
      node.op = 'not';
      t = /^not\s(.*)/.exec(clean);
      node.children = [t[1]].map(parseStatement);
      return node;
    }
    if (/\sand\s/g.test(clean)) {
      node.op = 'and';
      t = clean.split(` ${node.op} `);
      node.children = t.map(parseStatement);
      return node;
    }
    if (/\sor\s/g.test(clean)) {
      node.op = 'or';
      t = clean.split(` ${node.op} `);
      node.children = t.map(parseStatement);
      return node;
    }
    if (/\s(\<|\>|\<\=|\>\=|\=\=)\s/g.test(clean)) {
      const matchOp = /\s(\<|\>|\<\=|\>\=|\=\=)\s/g.exec(clean);
      node.op = matchOp[1];
      t = clean.split(` ${node.op} `);
      node.children = t.map(parseStatement);
      return node;
    }
    if (/\s=\s/g.test(clean)) {
      node.op = '=';
      t = clean.split(` ${node.op} `);
      node.children = t.map(parseStatement);
      return node;
    }
    if (/\s(\+|\-)\s/g.test(clean)) {
      const matchOp = /\s(\+|\-)\s/g.exec(clean);
      node.op = matchOp[1];
      t = clean.split(` ${node.op} `);
      node.children = t.map(parseStatement);
      return node;
    }
    if (/\s(\*|\/)\s/g.test(clean)) {
      const matchOp = /\s(\*|\/)\s/g.exec(clean);
      node.op = matchOp[1];
      t = clean.split(` ${node.op} `);
      node.children = t.map(parseStatement);
      return node;
    }
    if (/^(\$[a-zA-Z]+)$/g.test(clean)) {
      variables[clean] = variables[clean] ? variables[clean] : null;
    }
    return clean;
  }

  function extractVars(stm) {
    const vars = [];
    let result;
    while ((result = /(\$[a-zA-Z]+)/g.exec(stm))) {
      if (result) vars.push(result[1]);
      stm = stm.replace(result[1], '');
    }
    return vars;
  }

  function getPatternExtractor(stm) {
    let result;
    while ((result = /(\$[a-zA-Z]+)/g.exec(stm))) {
      stm = stm.replace(result[1], '([a-zA-Z0-9]+)');
    }
    stm = stm.replace(/\,/g, '\\,');
    stm = stm.replace(/\s/g, '\\s');
    return stm;
  }

  function onExtractPatternValues(stm, extractor, cb) {
    const m3 = new RegExp(extractor, 'g');
    let result;
    while (result = m3.exec(stm)) {
      //console.log('match?', stm, extractor, result);
      if (result) {
        result.splice(0, 1);
        delete result.index;
        delete result.input;
        stm = stm.replace(result[1], '');
        cb(result);
      }
    }
  }

  function replaceVars(stm, vars) {
    const k = keys(vars);
    for (let i = 0; i < k.length; i++) {
      const regex = new RegExp(k[i].replace('$', '\\$'), "g");
      let result;
      while ((result = regex.exec(stm))) {
        if (vars[k[i]]) stm = stm.replace(result[0], vars[k[i]]);
      }
    }
    stm = stm.replace(/\'/g, '');
    return stm;
  }

  function extractPattern(stm) {
    let result;
    let patterns = [];
    while (result = /\'([^\']+)\'/g.exec(stm)) {
      patterns.push(result[1]);
      stm = stm.replace(result[0], '');
    }
    return patterns;
  }

  function onMatch(stm, pattern, cb) {
    const v = extractVars(pattern);
    //console.log('extract vars', v);
    const extractor = getPatternExtractor(pattern);
    const vars = {};
    onExtractPatternValues(stm, extractor, vals => {
      v.map((i, j) => { return vars[i] = vals[j]; });
      cb(vars);
    });
  }

  function nodeToString(node) {
    if (typeof node === 'string') return node;
    if (node.op === 'out') {
      return `${node.op} ${nodeToString(node.children[0])}`;
    }
    if (node.op === 'p') {
      return node.children[0] + '(' + nodeToString(node.children[1]) + ')' + node.children[2];
    }
    if (node.op === 'not') {
      return `${node.op} ${nodeToString(node.children[0])}`;
    }
    const sts = [];
    node.children.map(n => {
      sts.push(nodeToString(n));
    });
    return sts.join(` ${node.op} `);
  }

  /**
   * Evaluate node
   * @param {Object|String} node The node to evaluate
   */
  function evaluateNode(node, vars, statements, level) {
    //console.log('node', nodeToString(node));
    if (typeof node === 'undefined') return '';
    if (typeof node === 'string') {
      let val = node;
      if (/\$/g.exec(node)) {
        if (keys(vars).indexOf(node) > -1) val = vars[node];
        else val = replaceVars(val, vars);
      } else if (node === 'true') val = true;
      else if (node === 'false') val = false;
      else if (!isNaN(node)) val = +node;
      else val = node;
      val = isNaN(val) ? val : +val;
      return val;
    }

    // Is a node, evaluate their children
    //console.log('vars', JSON.stringify(vars));
    //console.log('debug', node, vars);
    if (node.op === 'forany') {
      node.val = evaluateFromAny(node, vars, statements, level);
    }
    if (node.op === 'foreach') {
      node.val = evaluateForEach(node, vars, statements, level);
    }
    if (node.op === 'while') {
      node.val = evaluateWhile(node, vars, statements, level);
    }
    if (node.op === 'if') {
      node.val = evaluateIF(node, vars, statements, level);
    }
    if (node.op === 'p') {
      node.val = evaluateNode(
        parseStatement(
          node.children[0]
          + evaluateNode(node.children[1], vars, statements, level + 1)
          + node.children[2]
        ),
        vars, statements, level + 1
      );
    }
    if (node.op === 'out') {
      node.val = evaluateNode(node.children[0], vars, statements, level + 1);
      global.console.log(node.val);
    }
    if (node.op === 'not') {
      node.val = !evaluateNode(node.children[0], vars, statements, level + 1);
    }
    if (node.op === 'and') {
      node.val = true;
      node.children.map(n => {
        node.val = node.val && evaluateNode(n, vars, statements, level + 1);
      });
    }
    if (node.op === 'or') {
      node.val = true;
      node.children.map(n => {
        node.val = node.val || evaluateNode(n, vars, statements, level + 1);
      });
    }
    if (node.op === '==') {
      node.val = evaluateNode(node.children[0], vars, statements, level + 1)
        ==
        evaluateNode(node.children[1], vars, statements, level + 1);
    }
    if (node.op === '>') {
      node.val = evaluateNode(node.children[0], vars, statements, level + 1)
        >
        evaluateNode(node.children[1], vars, level + 1);
    }
    if (node.op === '<') {
      node.val = evaluateNode(node.children[0], vars, statements, level + 1)
        <
        evaluateNode(node.children[1], vars, statements, level + 1);
    }
    if (node.op === '>=') {
      node.val = evaluateNode(node.children[0], vars, statements, level + 1)
        >=
        evaluateNode(node.children[1], vars, statements, level + 1);
    }
    if (node.op === '<=') {
      node.val = evaluateNode(node.children[0], vars, statements, level + 1)
        <=
        evaluateNode(node.children[1], vars, statements, level + 1);
    }
    if (node.op === '=') {
      node.val = evaluateNode(node.children[1], vars, statements, level + 1);
      vars[node.children[0]] = node.val;
    }
    if (node.op === '+') {
      node.val = evaluateNode(node.children[0], vars, statements, level + 1);
      for (let i = 1; i < node.children.length; i++) {
        node.val += evaluateNode(node.children[i], vars, statements, level + 1);
      }
    }
    if (node.op === '-') {
      node.val = evaluateNode(node.children[0], vars, statements, level + 1);
      for (let i = 1; i < node.children.length; i++) {
        node.val -= evaluateNode(node.children[i], vars, statements, level + 1);
      }
    }
    if (node.op === '*') {
      node.val = evaluateNode(node.children[0], vars, statements, level + 1);
      for (let i = 1; i < node.children.length; i++) {
        node.val *= evaluateNode(node.children[i], vars, statements, level + 1);
      }
    }
    if (node.op === '/') {
      node.val = evaluateNode(node.children[0], vars, statements, level + 1);
      for (let i = 1; i < node.children.length; i++) {
        node.val /= evaluateNode(node.children[i], vars, statements, level + 1);
      }
    }

    debug(level, nodeToString(node), vars, node.val);
    return node.val;
  }

  function solve(condition, then, localVars, vars, statements, level) {
    let newNode = parseStatement(condition);
    let mergedVars = assign(vars, localVars);
    const conditionResult = evaluateNode(newNode, mergedVars, statements, level + 1);
    const conditionEval = replaceVars(condition, mergedVars);
    //console.log('condition result', conditionEval, conditionResult);
    if (conditionResult) {
      newNode = parseStatement(replaceVars(then, mergedVars));
      return { node: newNode, vars: mergedVars, result: conditionResult };
    }
    return false;
  }

  function onMatchPattern(node, statements, cb) {
    const condition = nodeToString(node.children[1]);
    const then = nodeToString(node.children[0]);
    const patterns = extractPattern(condition);
    statements.map(stm => {
      patterns.map(pattr => {
        onMatch(stm, pattr, localVars => {
          cb(localVars, condition, then);
        });
      });
    });
  }

  function evaluateIF(node, vars, statements, level) {
    if (/\'([^\']+)\'/g.test(nodeToString(node))) {
      node.val = evaluateForEach(node, vars, statements, level);
      return node.val;
    }
    node.val = evaluateNode(node.children[1], vars, statements, level + 1);
    if (node.val) {
      return evaluateNode(node.children[0], vars, statements, level + 1);
    }
  }

  function evaluateForEach(node, vars, tmpStatements, level) {
    if (/\'([^\']+)\'/g.test(nodeToString(node.children[1])) === null) return;
    const total = statements.length;
    const newStatements = [];
    onMatchPattern(node, tmpStatements, (localVars, condition, then) => {
      let result = solve(condition, then, localVars, vars, tmpStatements, level);
      if (result) {
        newStatement = nodeToString(evaluateNode(parseStatement(then), result.vars, tmpStatements, level + 1));
        if (statements.indexOf(newStatement) < 0) {
          //evaluateNode(result.node, result.vars, statements, level);
          statements.push(newStatement);
          newStatements.push(newStatement);
        }
      }
    });

    // Repeat if more statements were added
    if (newStatements.length) return evaluateForEach(node, vars, newStatements, level + 1);
  }

  function evaluateWhile(node, vars, tmpStatements, level) {
    if (/\'([^\']+)\'/g.test(nodeToString(node.children[1])) === null) return;
    let lastVars = Object.assign({}, vars);
    let newStatement;
    onMatchPattern(node, tmpStatements, (localVars, condition, then) => {
      let result = solve(condition, then, localVars, vars, tmpStatements, level);
      if (result) {
        newStatement = evaluateNode(parseStatement(then), result.vars, tmpStatements, level + 1);
        lastVars = evaluateWhile(node, result.vars, [newStatement], level + 1);
        node.val = evaluateNode(parseStatement(newStatement), lastVars, tmpStatements, level + 1);
        if (statements.indexOf(''+node.val) < 0) statements.push(newStatement);
      }
    });
    return lastVars;
  }

  function evaluateFromAny(node, vars, statements, level) {
    if (/\'([^\']+)\'/g.test(nodeToString(node.children[1])) === null) return;
    let total = statements.length;
    let matrix = {};
    keys(vars).map(k => { matrix[k] = []; });
    const condition = nodeToString(node.children[1]);
    const then = nodeToString(node.children[0]);
    onMatchPattern(node, statements, (localVars) => {
      keys(localVars).map(k => {
        matrix[k] = matrix[k] ? matrix[k] : []; matrix[k].push(localVars[k])
      });
    });

    // Create combinations
    let data = [];
    keys(matrix).map(b => { if (matrix[b].length === 0) delete matrix[b]; });
    keys(matrix).map(k => { if (matrix[k].length) data.push(matrix[k]); });
    let cmb = comb.cartesianProduct.apply(null, data);
    while(slice = cmb.next()) {
      let localVars = {};
      keys(matrix).map((k, i) => { localVars[k] = slice[i]; });

      // Run solve condition for each var combination
      let result = solve(condition, then, localVars, vars, statements, level);
      if (result) {
        let newStatement = nodeToString(result.node);
        //console.log('new statement', newStatement);
        if (statements.indexOf(newStatement) < 0) {
          evaluateNode(result.node, result.vars, statements, level);
          statements.push(newStatement);
        }
      }
    }

    // Repeat foreach result generated
    if (total < statements.length) return evaluateFromAny(node, vars, statements, level);
  }

  function debug(level, stm, vars, result) {
    let spaces = '';
    for (let h = 0; h < level; h++) spaces += '  ';
    //console.log('debug:', level, spaces + stm, vars, result);
    var waitTill = new Date(new Date().getTime() + 0.5 * 1000);
    //while(waitTill > new Date()){}
  }

  return {
    run() {
      sentences.map(r => evaluateNode(parseStatement(r), variables, statements, 0));
    }
  };
}

module.exports = Pattr;
