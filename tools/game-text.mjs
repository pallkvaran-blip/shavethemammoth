// Every string in the game's source, with where it sits in the code (file, line, and the names it is nested under:
// SAYS.gnome.hello.0, Game.guide.tell().#1). It is how the lines in docs/game-text.json were found: anything a player
// reads is one of these, among a great many that are not (names of bones, shaders, selectors).
//   node tools/game-text.mjs > strings.json
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const require = createRequire(join(ROOT, 'package.json'));
const { parseAst } = await import(require.resolve('rolldown/parseAst'));
const files = [];
const walkDir = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walkDir(p); else if (p.endsWith('.js')) files.push(p); } };
walkDir(join(ROOT, 'src'));
// calls whose string arguments are never words for the player
const CODE_CALLS = /(^|\.)(getElementById|querySelector|querySelectorAll|addEventListener|removeEventListener|setAttribute|getAttribute|removeAttribute|createElement|createElementNS|closest|matches|has|get|add|delete|remove|toggle|contains|includes|startsWith|endsWith|indexOf|split|join|replace|replaceAll|test|match|getContext|getExtension|getParameter|setProperty|getPropertyValue|require|import|heard|emit|changed|on|feat|see|bone|restPos|take|setTool|choose|buy|owns|level|price|available|spend|fanfare|swish|switch|motor|slide|clack|release|stick|blip|key|patch|kit|num|\$|matchMedia|warn|log|error|info|assert|time|timeEnd|mark|measure|createShader|fillText|strokeText|setItem|getItem|removeItem|postMessage|define|layer|hang|grow|pivot|eye)$/;
const out = [];
for (const file of files) {
  const rel = relative(ROOT, file);
  const src = readFileSync(file, 'utf8');
  let ast;
  try { ast = parseAst(src); } catch (e) { console.error('cannot parse', rel, e.message); continue; }
  const path = [];
  const text = (n) => src.slice(n.start, n.end);
  const short = (s) => s.replace(/\s+/g, ' ').slice(0, 60);
  const visit = (node, parent, key, index) => {
    if (!node || typeof node.type !== 'string') return;
    let pushed = 0;
    const push = (label) => { path.push(label); pushed++; };
    if (parent && parent.type === 'ArrayExpression' && key === 'elements') push(String(index));
    if (parent && (parent.type === 'CallExpression' || parent.type === 'NewExpression') && key === 'arguments') push('#' + index);
    switch (node.type) {
      case 'ImportDeclaration': case 'ExportAllDeclaration': return;
      case 'VariableDeclarator': if (node.id && node.id.type === 'Identifier') push(node.id.name); break;
      case 'FunctionDeclaration': case 'ClassDeclaration': if (node.id) push(node.id.name); break;
      case 'MethodDefinition': case 'PropertyDefinition': if (node.key && node.key.name) push(node.key.name); break;
      case 'Property': if (!node.computed) push(node.key.type === 'Identifier' ? node.key.name : String(node.key.value)); break;
      case 'AssignmentExpression': push(short(text(node.left)) + '='); break;
      case 'CallExpression': case 'NewExpression': push(short(text(node.callee)).replace(/^this\./, '') + '()'); break;
      default: break;
    }
    const isString = node.type === 'Literal' && typeof node.value === 'string';
    if (isString || node.type === 'TemplateLiteral') {
      // not words: a property's own name, something compared against, a case label, a member looked up by name
      const skip = (parent.type === 'Property' && key === 'key') || (parent.type === 'MemberExpression' && key === 'property') || parent.type === 'SwitchCase'
        || (parent.type === 'BinaryExpression' && /^(===|!==|==|!=|in|instanceof)$/.test(parent.operator))
        || parent.type === 'TaggedTemplateExpression';
      const callee = [...path].reverse().find((p) => p.endsWith('()'));
      const directArg = parent && (parent.type === 'CallExpression' || parent.type === 'NewExpression') && key === 'arguments';
      const codeCall = directArg && CODE_CALLS.test(short(text(parent.callee)).replace(/\(.*$/, ''));
      let value;
      if (isString) value = node.value;
      else { value = ''; node.quasis.forEach((q, i) => { value += q.value.cooked; if (i < node.expressions.length) value += '${' + text(node.expressions[i]) + '}'; }); }
      if (!skip && !codeCall && value.trim().length > 1) {
        const line = src.slice(0, node.start).split('\n').length;
        out.push({ file: rel, line, start: node.start, end: node.end, path: path.join('.'), callee: callee || '', value, kind: isString ? 'string' : 'template' });
      }
      if (node.type === 'TemplateLiteral') { /* strings inside its ${} are walked below */ }
    }
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (!v || typeof v !== 'object') continue;
      if (Array.isArray(v)) v.forEach((c, i) => visit(c, node, k, i)); else if (typeof v.type === 'string') visit(v, node, k, 0);
    }
    while (pushed--) path.pop();
  };
  visit(ast, null, null, 0);
}
console.log(JSON.stringify(out));
