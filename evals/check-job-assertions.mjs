#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { validateVisualJob } = require('../scripts/lib/visual-job');
const cases = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', 'agent-cases.json'), 'utf8'));

function visibleHtmlText(value) {
  let html = String(value || '').replace(/<!--[\s\S]*?-->/g, ' ');
  const nonVisibleBlocks = [
    /<(style|script|template|noscript|head)\b[^>]*>[\s\S]*?<\/\1>/gi,
    /<([a-z][\w:-]*)\b(?=[^>]*(?:\shidden(?:\s|=|>)|aria-hidden\s*=\s*["']?true|style\s*=\s*(?:["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^"']*["']|[^\s>]*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^\s>]*)))[^>]*>[\s\S]*?<\/\1>/gi,
  ];
  for (const pattern of nonVisibleBlocks) {
    let previous;
    do {
      previous = html;
      html = html.replace(pattern, ' ');
    } while (html !== previous);
  }
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function bodyText(body) {
  return (body || []).flatMap(element => {
    if (!element || typeof element !== 'object') return [];
    if (['paragraph', 'heading', 'highlight', 'blockquote', 'layer_card'].includes(element.type)) {
      return [element.label, element.text];
    }
    if (element.type === 'items') return (element.entries || []).flatMap(entry => [entry.label, entry.text]);
    if (element.type === 'data_row') return [element.key, element.value];
    if (element.type === 'reading_unit') return [element.quote, element.thought];
    if (element.type === 'media') return [element.caption];
    if (element.type === 'process') return (element.steps || []).flatMap(step => [step.label, step.title, step.text]);
    return [];
  }).filter(Boolean);
}

function posterCardProjection(card) {
  return [card.title, ...bodyText(card.body)].filter(Boolean);
}

function semanticProjection(contract) {
  switch (contract.mode) {
    case 'big':
      return [contract.phrase, contract.attribution, contract.ghost_char].filter(Boolean);
    case 'long':
      return [contract.kicker, contract.title, contract.subtitle, ...bodyText(contract.body)].filter(Boolean);
    case 'whiteboard':
      return [
        contract.title,
        contract.subtitle,
        ...(contract.steps || []).flatMap(step => [
          step.text,
          ...(step.nodes || []).map(node => node.text),
          ...(step.items || []).flatMap(item => [item.name, item.desc]),
        ]),
      ].filter(Boolean);
    case 'poster':
      return [contract.title, contract.subtitle, ...(contract.cards || []).map(posterCardProjection)].filter(Boolean);
    case 'editorial-image':
      return [
        contract.title,
        contract.kicker,
        contract.subtitle,
        contract.visual_metaphor,
        contract.art_direction,
        contract.cover_motif,
        visibleHtmlText(contract.content_html),
      ].filter(Boolean);
    case 'article-diagram':
      return [
        contract.title,
        contract.subtitle,
        contract.formula,
        contract.sentence,
        contract.caption,
        ...(contract.structure?.nodes || []).flatMap(node => [node.label, node.note]),
        ...(contract.structure?.relations || []).map(relation => relation.label),
        ...(contract.nodes || []).flatMap(node => [node.label, node.note]),
        ...(contract.links || []).map(link => link.label),
        ...(contract.zones || []).flatMap(zone => [zone.label, zone.description]),
      ].filter(Boolean);
    case 'infograph':
    case 'comic':
    case 'sketchnote':
      return [contract.title, contract.subtitle, visibleHtmlText(contract.content_html)].filter(Boolean);
    default:
      return [];
  }
}

function semanticText(contract) {
  return JSON.stringify(semanticProjection(contract)).toLocaleLowerCase('en-US');
}

function artifactsForOutput(job, output) {
  if (job.schema_version === 3) return output.artifacts || [];
  return [{
    artifact_index: 1,
    id: output.id,
    role: output.section || 'output',
    source_unit_ids: output.source_unit_ids,
    visual_plan: output.visual_plan,
  }];
}

function artifactEntries(job) {
  return job.outputs.flatMap(output => artifactsForOutput(job, output).map((artifact, artifactOffset) => ({
    output,
    artifact,
    artifactOffset,
  })));
}

function artifactSemanticText(entry) {
  const { output, artifactOffset } = entry;
  if (output.render_contract.mode === 'poster' && output.render_contract.cards?.[artifactOffset]) {
    return JSON.stringify(posterCardProjection(output.render_contract.cards[artifactOffset])).toLocaleLowerCase('en-US');
  }
  return semanticText(output.render_contract);
}

function visibleContractText(contract) {
  if (contract.mode !== 'editorial-image') return semanticText(contract);
  return JSON.stringify([
    contract.title,
    contract.kicker,
    contract.subtitle,
    visibleHtmlText(contract.content_html),
  ].filter(Boolean)).toLocaleLowerCase('en-US');
}

function assertRequiredTermsInContracts(job, expected) {
  const contracts = job.outputs.map(output => semanticText(output.render_contract));
  const serialized = contracts.join('\n');
  for (const term of expected.required_terms || []) {
    assert.ok(serialized.includes(term.toLocaleLowerCase('en-US')), `Render contracts lost required source term "${term}"`);
  }
  const usedContracts = new Set();
  for (const group of expected.required_contract_term_groups || []) {
    const normalizedGroup = group.map(term => term.toLocaleLowerCase('en-US'));
    const match = contracts.findIndex((contract, index) => (
      !usedContracts.has(index) && normalizedGroup.every(term => contract.includes(term))
    ));
    assert.notEqual(match, -1, `No distinct render contract preserves source term group "${group.join(' + ')}"`);
    usedContracts.add(match);
  }

  const usedSourceUnits = new Set();
  const usedArtifacts = new Set();
  const artifacts = artifactEntries(job);
  const sourceMappings = expected.required_source_contract_mappings || [];
  for (const [mappingIndex, mapping] of sourceMappings.entries()) {
    const sourceIndex = job.source_units.findIndex((unit, index) => {
      if (usedSourceUnits.has(index)) return false;
      const sourceText = [unit.label, unit.excerpt].filter(Boolean).join('\n').toLocaleLowerCase('en-US');
      return mapping.source_terms.every(term => sourceText.includes(term.toLocaleLowerCase('en-US')));
    });
    assert.notEqual(sourceIndex, -1, `No distinct source unit preserves source term group "${mapping.source_terms.join(' + ')}"`);
    const sourceUnit = job.source_units[sourceIndex];
    const artifactIndex = artifacts.findIndex((entry, index) => (
      !usedArtifacts.has(index) && entry.artifact.source_unit_ids.includes(sourceUnit.id)
    ));
    assert.notEqual(artifactIndex, -1, `No distinct artifact references source unit "${sourceUnit.id}"`);
    const mappedContract = artifactSemanticText(artifacts[artifactIndex]);
    assert.ok(
      mapping.contract_terms.every(term => mappedContract.includes(term.toLocaleLowerCase('en-US'))),
      `Artifact for source unit "${sourceUnit.id}" lost contract term group "${mapping.contract_terms.join(' + ')}"`,
    );
    if (expected.exclusive_source_contract_mappings) {
      for (const [otherIndex, other] of sourceMappings.entries()) {
        if (otherIndex === mappingIndex) continue;
        assert.equal(
          other.contract_terms.every(term => mappedContract.includes(term.toLocaleLowerCase('en-US'))),
          false,
          `Artifact for source unit "${sourceUnit.id}" duplicated another source group "${other.contract_terms.join(' + ')}"`,
        );
      }
    }
    usedSourceUnits.add(sourceIndex);
    usedArtifacts.add(artifactIndex);
  }

  const cardGroups = expected.required_card_term_groups || [];
  if (cardGroups.length) {
    const cards = job.outputs.flatMap(output => output.render_contract.cards || []);
    assert.ok(cards.length, 'Per-card semantic anchors require render_contract.cards');
    const serializedCards = cards.map(card => JSON.stringify(posterCardProjection(card)).toLocaleLowerCase('en-US'));
    const usedCards = new Set();
    for (const [groupIndex, group] of cardGroups.entries()) {
      const normalizedGroup = group.map(term => term.toLocaleLowerCase('en-US'));
      const match = serializedCards.findIndex((card, index) => (
        !usedCards.has(index) && normalizedGroup.every(term => card.includes(term))
      ));
      assert.notEqual(match, -1, `No distinct card preserves source term group "${group.join(' + ')}"`);
      if (expected.exclusive_card_term_groups) {
        for (const [otherIndex, other] of cardGroups.entries()) {
          if (otherIndex === groupIndex) continue;
          assert.equal(
            other.some(term => serializedCards[match].includes(term.toLocaleLowerCase('en-US'))),
            false,
            `Card for "${group.join(' + ')}" duplicated another source group "${other.join(' + ')}"`,
          );
        }
      }
      usedCards.add(match);
    }
  }
}

function assertSourceAssignment(job, expected) {
  const artifacts = artifactEntries(job);
  const referenced = artifacts.flatMap(entry => entry.artifact.source_unit_ids);
  const requiredUnits = job.source_units.filter(sourceUnit => (
    !sourceUnit.evidence
    || (sourceUnit.evidence.strength !== 'unusable' && sourceUnit.evidence.freshness === 'current')
  ));
  for (const sourceUnit of requiredUnits) {
    assert.ok(referenced.includes(sourceUnit.id), `Visual Job does not render source unit "${sourceUnit.id}"`);
  }
  if (expected.source_unit_assignment === 'one-to-one') {
    assert.ok(artifacts.every(entry => entry.artifact.source_unit_ids.length === 1), 'Each artifact must reference exactly one source unit');
    assert.equal(new Set(referenced).size, artifacts.length, 'One-to-one artifacts must reference distinct source units');
  }
}

function assertRejectedEvidence(job, expected) {
  const referenced = new Set(artifactEntries(job).flatMap(entry => entry.artifact.source_unit_ids));
  for (const rejected of expected.rejected_source_expectations || []) {
    const unit = job.source_units.find(sourceUnit => {
      const text = [sourceUnit.label, sourceUnit.excerpt].filter(Boolean).join('\n').toLocaleLowerCase('en-US');
      return rejected.source_terms.every(term => text.includes(term.toLocaleLowerCase('en-US')));
    });
    assert.ok(unit, `Rejected evidence is missing source terms "${rejected.source_terms.join(' + ')}"`);
    assert.equal(unit.evidence?.strength, rejected.strength, `Rejected evidence "${unit.id}" has wrong strength`);
    assert.equal(unit.evidence?.freshness, rejected.freshness, `Rejected evidence "${unit.id}" has wrong freshness`);
    assert.ok(unit.evidence?.reason?.trim(), `Rejected evidence "${unit.id}" needs a reason`);
    assert.equal(referenced.has(unit.id), false, `Rejected evidence "${unit.id}" must not be referenced by an artifact`);
  }
}

if (process.argv.includes('--self-test')) {
  assert.equal(cases.cases.length, 24, 'CardBench must contain exactly twenty-four cases');
  assert.equal(cases.cases.filter(item => item.kind !== 'revision').length, 20, 'expected twenty planning cases');
  assert.equal(cases.cases.filter(item => item.kind === 'revision').length, 4, 'expected four revision cases');
  assert.ok(cases.cases.every(item => (
    item.request
    && item.source_text
    && item.modes.length
    && item.outputs.length === 2
    && Array.isArray(item.required_contract_fields)
  )), 'fresh-context case definition is incomplete');
  assert.equal(new Set(cases.cases.map(item => item.id)).size, cases.cases.length, 'fresh-context case ids must be unique');
  assert.ok(
    cases.cases.every(item => (
      item.required_terms?.length
      || item.required_contract_term_groups?.length
      || item.required_source_contract_mappings?.length
      || item.required_card_term_groups?.length
    )),
    'every fresh-context case must declare render-contract semantic anchors',
  );
  assert.throws(
    () => assertRequiredTermsInContracts(
      {
        source_units: [{ id: 'source', excerpt: 'grounded term' }],
        outputs: [{ source_unit_ids: ['source'], render_contract: { phrase: 'unrelated output' } }],
      },
      { required_terms: ['grounded term'] },
    ),
    /Render contracts lost required source term/,
    'source text alone must not satisfy render-contract fidelity',
  );
  assert.doesNotThrow(
    () => assertSourceAssignment(
      {
        schema_version: 3,
        source_units: [
          { id: 'current', evidence: { strength: 'primary', freshness: 'current' } },
          { id: 'old', evidence: { strength: 'unusable', freshness: 'stale' } },
        ],
        outputs: [{ artifacts: [{ source_unit_ids: ['current'] }] }],
      },
      {},
    ),
    'rejected evidence must remain unreferenced without failing source coverage',
  );
  assert.throws(
    () => assertRequiredTermsInContracts(
      {
        outputs: [
          { render_contract: { title: 'Input contract only' } },
          { render_contract: { title: 'Unrelated second diagram' } },
        ],
      },
      { required_contract_term_groups: [['input', 'contract'], ['publish', 'receipt']] },
    ),
    /No distinct render contract preserves source term group/,
    'split contracts must each preserve their own semantic anchor group',
  );
  assert.throws(
    () => assertRequiredTermsInContracts(
      {
        source_units: [
          { id: 'first', excerpt: 'input contract' },
          { id: 'second', excerpt: 'publish receipt' },
        ],
        outputs: [
          { source_unit_ids: ['first'], render_contract: { title: 'publish receipt' } },
          { source_unit_ids: ['second'], render_contract: { title: 'input contract' } },
        ],
      },
      {
        required_source_contract_mappings: [
          { source_terms: ['input'], contract_terms: ['input'] },
          { source_terms: ['publish'], contract_terms: ['publish'] },
        ],
      },
    ),
    /lost contract term group/,
    'semantic groups must remain bound to the output that references their source unit',
  );
  assert.throws(
    () => assertRequiredTermsInContracts(
      {
        source_units: [
          { id: 'first', excerpt: 'input contract publish receipt' },
          { id: 'second', excerpt: 'input contract publish receipt' },
        ],
        outputs: [
          { source_unit_ids: ['first'], render_contract: { mode: 'article-diagram', title: 'input contract publish receipt' } },
          { source_unit_ids: ['second'], render_contract: { mode: 'article-diagram', title: 'generic' } },
        ],
      },
      {
        required_source_contract_mappings: [
          { source_terms: ['input'], contract_terms: ['input'] },
          { source_terms: ['publish'], contract_terms: ['publish'] },
        ],
      },
    ),
    /lost contract term group/,
    'duplicate source excerpts must not let one output satisfy multiple source mappings',
  );
  assert.throws(
    () => assertRequiredTermsInContracts(
      {
        source_units: [
          { id: 'first', excerpt: 'input contract' },
          { id: 'second', excerpt: 'publish receipt' },
        ],
        outputs: [
          { source_unit_ids: ['first'], render_contract: { mode: 'article-diagram', title: 'input contract publish receipt' } },
          { source_unit_ids: ['second'], render_contract: { mode: 'article-diagram', title: 'input contract publish receipt' } },
        ],
      },
      {
        required_source_contract_mappings: [
          { source_terms: ['input'], contract_terms: ['input'] },
          { source_terms: ['publish'], contract_terms: ['publish'] },
        ],
        exclusive_source_contract_mappings: true,
      },
    ),
    /duplicated another source group/,
    'split outputs must not repeat every source group in every artifact',
  );
  assert.throws(
    () => assertRequiredTermsInContracts(
      {
        source_units: [{ id: 'source', excerpt: 'one two' }],
        outputs: [{
          source_unit_ids: ['source'],
          render_contract: {
            mode: 'poster',
            cards: [
              { body: [{ type: 'paragraph', text: 'one' }], hidden: 'two' },
              { body: [{ type: 'paragraph', text: 'unrelated' }] },
            ],
          },
        }],
      },
      { required_card_term_groups: [['one'], ['two']] },
    ),
    /No distinct card preserves source term group/,
    'aggregate card text must not satisfy per-card semantic distribution',
  );
  assert.throws(
    () => assertRequiredTermsInContracts(
      {
        source_units: [{ id: 'source', excerpt: 'one two' }],
        outputs: [{
          source_unit_ids: ['source'],
          render_contract: {
            mode: 'poster',
            cards: [
              { body: [{ type: 'paragraph', text: 'one two' }] },
              { body: [{ type: 'paragraph', text: 'one two' }] },
            ],
          },
        }],
      },
      { required_card_term_groups: [['one'], ['two']], exclusive_card_term_groups: true },
    ),
    /duplicated another source group/,
    'series cards must not repeat every source group in every artifact',
  );
  assert.throws(
    () => assertRequiredTermsInContracts(
      {
        source_units: [{ id: 'source', excerpt: 'grounded term' }],
        outputs: [{
          source_unit_ids: ['source'],
          render_contract: { mode: 'big', phrase: 'unrelated output', hidden: 'grounded term' },
        }],
      },
      { required_terms: ['grounded term'] },
    ),
    /Render contracts lost required source term/,
    'renderer-ignored contract fields must not satisfy semantic fidelity',
  );
  assert.throws(
    () => assertRequiredTermsInContracts(
      {
        source_units: [{ id: 'source', excerpt: 'attention' }],
        outputs: [{
          source_unit_ids: ['source'],
          render_contract: {
            mode: 'editorial-image',
            title: '无关输出',
            content_html: '<!-- attention --><main>无关场景</main>',
            custom_css: '/* attention */ main { display: grid; }',
          },
        }],
      },
      { required_terms: ['attention'] },
    ),
    /Render contracts lost required source term/,
    'CSS and HTML comments must not satisfy Studio semantic fidelity',
  );
  assert.throws(
    () => assertRequiredTermsInContracts(
      {
        source_units: [{ id: 'source', excerpt: 'attention' }],
        outputs: [{
          source_unit_ids: ['source'],
          render_contract: {
            mode: 'editorial-image',
            title: '无关输出',
            content_html: '<main class="attention" id="attention-scene" aria-label="attention"><p>无关场景</p></main>',
            custom_css: '.attention { display: grid; }',
          },
        }],
      },
      { required_terms: ['attention'] },
    ),
    /Render contracts lost required source term/,
    'HTML attributes must not satisfy visible Studio semantic fidelity',
  );
  for (const hiddenHtml of [
    '<main><p hidden>attention</p><p>无关场景</p></main>',
    '<main><p style="display:none">attention</p><p>无关场景</p></main>',
    '<main><p style=display:none>attention</p><p>无关场景</p></main>',
    '<main><p style=visibility:hidden>attention</p><p>无关场景</p></main>',
    '<main><template>attention</template><p>无关场景</p></main>',
  ]) {
    assert.throws(
      () => assertRequiredTermsInContracts(
        {
          source_units: [{ id: 'source', excerpt: 'attention' }],
          outputs: [{
            source_unit_ids: ['source'],
            render_contract: {
              mode: 'editorial-image',
              title: '无关输出',
              content_html: hiddenHtml,
              custom_css: 'main { display: grid; }',
            },
          }],
        },
        { required_terms: ['attention'] },
      ),
      /Render contracts lost required source term/,
      'deterministically hidden HTML text must not satisfy Studio semantic fidelity',
    );
  }
  assert.throws(
    () => assertSourceAssignment(
      {
        source_units: [{ id: 'first' }, { id: 'second' }],
        outputs: [
          { source_unit_ids: ['first'] },
          { source_unit_ids: ['first'] },
        ],
      },
      { source_unit_assignment: 'one-to-one' },
    ),
    /does not render source unit|distinct source units/,
    'split outputs must not silently drop a source unit',
  );
  console.log('Visual Job eval self-test passed: 20 planning cases and 4 revision cases with grounded artifact assertions.');
  process.exit(0);
}
const input = process.argv[2];
if (!input) throw new Error('Usage: node evals/check-job-assertions.mjs <visual-job.json>');
const job = JSON.parse(fs.readFileSync(path.resolve(input), 'utf8')); const result = validateVisualJob(job);
if (!result.valid) throw new Error(result.errors.join('\n'));
const caseFlag = process.argv.indexOf('--case');
const caseId = caseFlag >= 0 ? process.argv[caseFlag + 1] : null;
const expected = cases.cases.find(item => item.id === caseId)
  || cases.cases.find(item => item.id === job.job_id)
  || cases.cases.find(item => item.publish_target === job.publish_target);
if (!expected) throw new Error(`No agent case matches ${job.job_id}`);
assert.equal(job.schema_version, expected.visual_job_version || 3, `fresh-context job must use Visual Job v${expected.visual_job_version || 3}`);
assert.equal(job.decision.selection_source, expected.selection_source || 'taxonomy');
assert.equal(job.decision.tier, expected.tier); assert.ok(expected.modes.includes(job.decision.mode));
assert.ok(job.outputs.length >= expected.outputs[0] && job.outputs.length <= expected.outputs[1]);
if (expected.source_units) {
  assert.ok(job.source_units.length >= expected.source_units[0] && job.source_units.length <= expected.source_units[1]);
}
assertSourceAssignment(job, expected);
assertRejectedEvidence(job, expected);
const plannedArtifacts = artifactEntries(job);
if (expected.artifact_outputs) {
  assert.ok(plannedArtifacts.length >= expected.artifact_outputs[0] && plannedArtifacts.length <= expected.artifact_outputs[1]);
}
if (expected.required_artifact_roles) {
  assert.deepEqual(plannedArtifacts.map(entry => entry.artifact.role), expected.required_artifact_roles);
}
for (const [index, output] of job.outputs.entries()) {
  for (const [artifactOffset, artifact] of artifactsForOutput(job, output).entries()) {
    const plan = artifact.visual_plan;
    assert.ok(plan && typeof plan === 'object', `outputs[${index}] artifact ${artifactOffset + 1} is missing visual_plan`);
    assert.ok(plan.core_message?.trim(), `outputs[${index}] artifact ${artifactOffset + 1} visual_plan is missing core_message`);
    assert.ok(plan.layout_strategy?.trim(), `outputs[${index}] artifact ${artifactOffset + 1} visual_plan is missing layout_strategy`);
    assert.ok(Array.isArray(plan.visual_hierarchy) && plan.visual_hierarchy.length, `outputs[${index}] artifact ${artifactOffset + 1} visual_plan is missing visual_hierarchy`);
    assert.ok(Array.isArray(plan.avoid_patterns), `outputs[${index}] artifact ${artifactOffset + 1} visual_plan is missing avoid_patterns`);
  }
  for (const field of expected.required_contract_fields || []) {
    assert.notEqual(output.render_contract[field], undefined, `outputs[${index}].render_contract is missing ${field}`);
    if (field === 'composition_required') assert.equal(output.render_contract[field], true);
  }
}
assertRequiredTermsInContracts(job, expected);
const serialized = job.outputs.map(output => visibleContractText(output.render_contract)).join('\n');
for (const term of expected.forbidden_terms || []) {
  assert.equal(serialized.includes(term.toLocaleLowerCase('en-US')), false, `Visual Job invented forbidden framing "${term}"`);
}
console.log(`Visual Job assertions passed: ${expected.id}`);
