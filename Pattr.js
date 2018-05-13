const assign = require('lodash.assign');
const keys = require('lodash.keys');
const comb = require('js-combinatorics');

function Pattr(input) {
  // Init variables table
  const contents = input.replace(/\r?\n|\r/g, '');
  let sentences = contents.split(';');
  sentences = sentences.filter(i => i);
  const statements = sentences.filter(i => i && /\s(if|while)\s/g.test(i) === false);
  //const rules = sentences.filter(i => i && /\sif\s/g.test(i) === true);
  const variables = {};
  let ast = [];

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
        cb(result);
        stm.replace(result[1], '');
      }
    }
  }

  function replaceVars(stm, vars) {
    const k = keys(vars);
    for (let i = 0; i < k.length; i++) {
      const regex = new RegExp(k[i].replace('$', '\\$'), "g");
      let result;
      while ((result = regex.exec(stm))) {
        stm = stm.replace(result[0], vars[k[i]]);
      }
    }
    stm = stm.replace(/\{|\}/g, '');
    return stm;
  }

  function extractPattern(stm) {
    let result;
    let patterns = [];
    while (result = /\{([^{]+)\}/g.exec(stm)) {
      patterns.push(result[1]);
      stm = stm.replace(result[0], '');
    }
    return patterns;
  }

  function onMatch(stm, pattern, cb) {
    const v = extractVars(pattern);
    const extractor = getPatternExtractor(pattern);
    const vars = {};
    onExtractPatternValues(stm, extractor, vals => {
      v.map((i, j) => {
        vars[i] = vals[j];
        return vals[i];
      });
      cb(vars);
    });
  }

  function nodeToString(node) {
    if (typeof node === 'string') return node;
    if (node.op === 'out') {
      return `${node.op} ${nodeToString(node.children[0])}`;
    }
    if (node.op === 'p') {
      return node.children[0] + nodeToString(node.children[1]) + node.children[2];
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

  function evaluateIF(node, vars) {
    let total = statements.length;
    let matrix = {};
    keys(vars).map(k => { matrix[k] = []; });

    function solve(condition, combVars) {
      //console.log('combVars before', combVars);
      const conditionEval = replaceVars(condition, combVars);
      const conditionResult = evaluateNode(parseStatement(conditionEval), combVars);
      //console.log('vars', combVars);
      //console.log('condition result', conditionEval, conditionResult);
      if (conditionResult) {
        let newNode = parseStatement(replaceVars(then, combVars));
        let newStatement = nodeToString(newNode);
        //console.log('then', newStatement);
        if (statements.indexOf(newStatement) < 0) {
          evaluateNode(newNode, combVars);
          statements.push(newStatement);
        }
        //statements.push(replaceVars(then, combVars));
        //evaluateNode(parseStatement(replaceVars(then, combVars)), combVars);
      }
    }

    const condition = nodeToString(node.children[1]);
    const then = nodeToString(node.children[0]);
    if (/\{(.*)\}/g.test(condition)) {
      const patterns = extractPattern(condition);
      //console.log('patterns', patterns);

      let i = 0;
      while(i < total) {
        if (statements[i].indexOf('if') > -1) continue;
        for (j = 0; j < patterns.length; j++) {
          onMatch(statements[i], patterns[j], vars2 => {
            keys(vars2).map(k => {matrix[k] = matrix[k] ? matrix[k] : []; matrix[k].push(vars2[k])});
            solve(condition, vars2);
          });
        }
        i++;
      }

      //console.log('total', total, statements.length)
      if (total < statements.length) {
        return evaluateIF(node, vars);
      }
      return node.val;
    }
    if (evaluateNode(node.children[1], vars)) {
      return evaluateNode(node.children[0], vars);
    }
    return node.val;
  }

  function evaluateWhile(node, vars) {
    let total = statements.length;
    let matrix = {};
    keys(vars).map(k => { matrix[k] = []; });

    function solve(condition, combVars) {
      //console.log('combVars before', combVars);
      const conditionEval = replaceVars(condition, combVars);
      const conditionResult = evaluateNode(parseStatement(conditionEval), combVars);
      //console.log('vars', combVars);
      console.log('condition result', conditionEval, conditionResult);
      if (conditionResult) {
        let newNode = parseStatement(replaceVars(then, combVars));
        let newStatement = nodeToString(newNode);
        //console.log('then', newStatement);
        if (statements.indexOf(newStatement) < 0) {
          evaluateNode(newNode, combVars);
          statements.push(newStatement);
        }
        //statements.push(replaceVars(then, combVars));
        //evaluateNode(parseStatement(replaceVars(then, combVars)), combVars);
      }
    }

    function solveWithMatrix(condition) {
      let data = [];
      //console.log('matrix', matrix);
      keys(matrix).map(b => {
        if (matrix[b].length === 0) delete matrix[b];
      })
      //console.log('after', matrix);
      keys(matrix).map(k => {
        if (matrix[k].length) data.push(matrix[k]);
      });
      //console.log('data', data);
      let cmb = comb.cartesianProduct.apply(null, data);
      while(slice = cmb.next()) {
        let combVars = {};
        keys(matrix).map((k, i) => {
          combVars[k] = slice[i];
        });
        solve(condition, combVars);
      }
    }

    const condition = nodeToString(node.children[1]);
    const then = nodeToString(node.children[0]);
    if (/\{(.*)\}/g.test(condition)) {
      const patterns = extractPattern(condition);
      //console.log('patterns', patterns);

      let i = 0;
      while(i < total) {
        if (statements[i].indexOf('while') > -1) continue;
        for (j = 0; j < patterns.length; j++) {
          onMatch(statements[i], patterns[j], vars2 => {
            keys(vars2).map(k => {matrix[k] = matrix[k] ? matrix[k] : []; matrix[k].push(vars2[k])});
          });
        }
        i++;
      }

      solveWithMatrix(condition);

      //console.log('total', total, statements.length)
      if (total < statements.length) {
        return evaluateWhile(node, vars);
      }
      return node.val;
    }
    return node.val;
  }

  /**
   * Evaluate node
   * @param {Object|String} node The node to evaluate
   */
  function evaluateNode(node, vars) {
    //console.log('node', nodeToString(node), vars);
    // Leaf of nodes is always a string
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
      //console.log('val', typeof val, val);
      return val;
    }

    // Is a node, evaluate their children

    if (node.op === 'p') {
      node.val = evaluateNode(
        parseStatement(
          node.children[0]
          + evaluateNode(node.children[1])
          + node.children[2]
        ), vars
      );
    }
    if (node.op === 'while') {
      node.val = evaluateWhile(node, vars);
    }
    if (node.op === 'if') {
      node.val = evaluateIF(node, vars);
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
      //console.log('= vars', vars, node.children[0]);
      //if (keys(vars).indexOf(node.children[0]) > -1) {
        vars[node.children[0]] = node.val;
      //}
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

  return {
    run() {
      // ast = rules.map(parseStatement);
      // ast.map(n => evaluateNode(n, variables));
      sentences.map(r => evaluateNode(parseStatement(r), variables));
      // ast.map(evaluateNode, variables);
    },
  };
}

module.exports = Pattr;
