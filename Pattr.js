const assign = require('lodash.assign');
const keys = require('lodash.keys');
const comb = require('js-combinatorics');

function Pattr(input) {

  // Init variables table
  const contents = input.replace(/\r?\n|\r/g, '');
  let sentences = contents.split(';');
  sentences = sentences.filter(i => i);
  const statements = sentences.filter(i => i && /\s(foreach|if|forany)\s/g.test(i) === false);
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
    if (/\sif\s/g.test(clean)) {
      node.op = 'if';
      t = clean.split(` ${node.op} `);
      node.children = t.map(parseStatement);
      return node;
    }
    if (/\(([^()]|).*\)/g.test(stm)) {
      node.op = 'p';
      t = /\(([^()]|).*\)/g.exec(stm);
      let parts = stm.split(t[0]);
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
  function evaluateNode(node, vars) {
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
    //console.log('node', nodeToString(node));
    //console.log('vars', JSON.stringify(vars));
    if (node.op === 'p') {
      node.val = evaluateNode(
        parseStatement(
          node.children[0]
          + evaluateNode(node.children[1])
          + node.children[2]
        ), vars
      );
    }
    if (node.op === 'forany') {
      node.val = evaluateFromAny(node, vars);
    }
    if (node.op === 'foreach') {
      node.val = evaluateForEach(node, vars);
    }
    if (node.op === 'if') {
      node.val = evaluateForEach(node, vars);
    }
    if (node.op === 'out') {
      node.val = evaluateNode(node.children[0], vars);
      global.console.log(node.val);
    }
    if (node.op === 'not') {
      node.val = !evaluateNode(node.children[0], vars);
    }
    if (node.op === 'and') {
      node.val = true;
      node.children.map(n => {
        node.val = node.val && evaluateNode(n, vars)
      });
    }
    if (node.op === 'or') {
      node.val = true;
      node.children.map(n => {
        node.val = node.val || evaluateNode(n, vars)
      });
    }
    if (node.op === '==') {
      node.val = evaluateNode(node.children[0], vars) == evaluateNode(node.children[1], vars);
    }
    if (node.op === '>') {
      node.val = evaluateNode(node.children[0], vars) > evaluateNode(node.children[1], vars);
    }
    if (node.op === '<') {
      node.val = evaluateNode(node.children[0], vars) < evaluateNode(node.children[1], vars);
    }
    if (node.op === '>=') {
      node.val = evaluateNode(node.children[0], vars) >= evaluateNode(node.children[1], vars);
    }
    if (node.op === '<=') {
      node.val = evaluateNode(node.children[0], vars) <= evaluateNode(node.children[1], vars);
    }
    if (node.op === '=') {
      node.val = evaluateNode(node.children[1], vars);
      vars[node.children[0]] = node.val;
    }
    if (node.op === '+') {
      node.val = evaluateNode(node.children[0], vars) + evaluateNode(node.children[1], vars);
    }
    if (node.op === '-') {
      node.val = evaluateNode(node.children[0], vars) - evaluateNode(node.children[1], vars);
    }
    if (node.op === '*') {
      node.val = evaluateNode(node.children[0], vars) * evaluateNode(node.children[1], vars);
    }
    if (node.op === '/') {
      node.val = evaluateNode(node.children[0], vars) / evaluateNode(node.children[1], vars);
    }
    return node.val;
  }

  // TODO: extract add statement???
  function solve(condition, then, localVars, vars) {
    let newNode = parseStatement(condition);
    let margedVars = assign(vars, localVars);
    const conditionResult = evaluateNode(newNode, margedVars);
    const conditionEval = replaceVars(condition, margedVars);
    //console.log('condition result', conditionEval, conditionResult);
    if (conditionResult) {
      newNode = parseStatement(replaceVars(then, margedVars));
      let newStatement = nodeToString(newNode);
      //console.log('new statement', newStatement);
      if (statements.indexOf(newStatement) < 0) {
        evaluateNode(newNode, margedVars);
        statements.push(newStatement);
      }
    }
  }

  function evaluateIF(node, vars) {

    // Skip pattern supplied, run foreach
    if (/\'([^\']+)\'/g.test(condition)) {
      return evaluateForEach(mode, vars);
    }
    if (evaluateNode(node.children[1], vars)) {
      return evaluateNode(node.children[0], vars);
    }
  }

  function evaluateForEach(node, vars) {

    // Skip if no pattern supplied
    if (/\'([^\']+)\'/g.test(nodeToString(node.children[1])) === null) return;

    const total = statements.length;
    const condition = nodeToString(node.children[1]);
    const then = nodeToString(node.children[0]);
    const patterns = extractPattern(condition);
    statements.map(stm => {
      patterns.map(pattr => {
        onMatch(stm, pattr, localVars => {
          solve(condition, then, localVars, vars);
        });
      });
    });

    // Repeat if more statements were added
    if (total < statements.length) return evaluateForEach(node, vars);
  }

  function evaluateFromAny(node, vars) {

    // Skip if no pattern supplied
    if (/\'([^\']+)\'/g.test(nodeToString(node.children[1])) === null) return;

    let total = statements.length;
    let matrix = {};
    keys(vars).map(k => { matrix[k] = []; });
    const condition = nodeToString(node.children[1]);
    const then = nodeToString(node.children[0]);
    const patterns = extractPattern(condition);
    statements.map(stm => {
      patterns.map(pattr => {
        onMatch(stm, pattr, vars2 => {
          keys(vars2).map(k => {
            matrix[k] = matrix[k] ? matrix[k] : []; matrix[k].push(vars2[k])
          });
        });
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
      solve(condition, then, localVars, vars);
    }

    // Repeat if more statements were added
    if (total < statements.length) return evaluateFromAny(node, vars);
  }

  return {
    run() {
      sentences.map(r => evaluateNode(parseStatement(r), variables));
    }
  };
}

module.exports = Pattr;
