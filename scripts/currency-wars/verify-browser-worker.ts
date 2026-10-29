import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { parseArgs } from 'node:util'
import { loadSnapshot, projectRoot } from './data'
import { evaluateLineup } from '../../src/tools/currency-wars/evaluate'
import type { ResultMessage } from '../../src/tools/currency-wars/browser/protocol'
import type { OptimizationRequest } from '../../src/tools/currency-wars/types'

// Execute the built browser Worker in a separate Node thread with a browser-only VM global.
// No browser is launched; fetch serves only emitted local assets and validates the supplied base.
const probeCode = String.raw`
const {parentPort,workerData}=require('node:worker_threads');
const {readFileSync}=require('node:fs');const path=require('node:path');const vm=require('node:vm');
(async()=>{
  const {directory,entry,base,message}=workerData;const origin='https://worker-probe.invalid';const fetched=[];
  const context=vm.createContext({console,URL,performance,WebAssembly,TextEncoder,TextDecoder,Response,Request,Headers,setTimeout,clearTimeout,WorkerGlobalScope:class{},fetch:async(input)=>{
    const url=new URL(String(input),origin);if(url.origin!==origin||!url.pathname.startsWith(base+'assets/')||!url.pathname.endsWith('.wasm'))throw new Error('Unexpected WASM URL: '+url.href);
    const relative=url.pathname.slice(base.length);if(relative.split('/').some(part=>part==='..'))throw new Error('Unsafe asset path');fetched.push(url.pathname);
    return new Response(readFileSync(path.join(directory,relative)),{headers:{'Content-Type':'application/wasm'}});
  }});context.self=context;context.postMessage=(response)=>parentPort.postMessage({response,fetched});
  const modules=new Map();
  function load(relative){if(modules.has(relative))return modules.get(relative);const absolute=path.resolve(directory,relative);if(!absolute.startsWith(directory+path.sep))throw new Error('Unsafe module path');
    const identifier=origin+base+relative.replaceAll(path.sep,'/');
    const module=new vm.SourceTextModule(readFileSync(absolute,'utf8'),{context,identifier,initializeImportMeta(meta){meta.url=identifier;},importModuleDynamically(){throw new Error('Unexpected browser dynamic import');}});modules.set(relative,module);return module;}
  const entryModule=load(entry);await entryModule.link((specifier,ref)=>{const url=new URL(specifier,ref.identifier);if(!url.pathname.startsWith(base))throw new Error('Module escaped BASE_URL');return load(url.pathname.slice(base.length));});await entryModule.evaluate();
  parentPort.postMessage({started:true});await context.onmessage({data:message});
})().catch(error=>{throw error});
`

async function main() {
  const { values } = parseArgs({
    options: { dist: { type: 'string', default: 'dist' }, base: { type: 'string', default: '/' } },
  })
  const directory = path.resolve(projectRoot, values.dist!)
  const base = values.base!
  if (!base.startsWith('/') || !base.endsWith('/'))
    throw new Error('Probe base must start and end with /')
  const entryName = (await readdir(path.join(directory, 'assets'))).find((file) =>
    /^solver\.worker-.*\.js$/.test(file),
  )
  if (!entryName) throw new Error('Built solver Worker missing')
  const snapshot = await loadSnapshot()
  for (const objective of ['min-roles', 'min-emblems'] as const) {
    const request: OptimizationRequest = {
      objective,
      slots: 13,
      emblemBudget: 12,
      includeExperts: false,
      timeLimitSeconds: 5,
      tasks: [{ id: 'browser-probe-xianzhou', traitId: 1007, requiredCount: 7 }],
    }
    const worker = new Worker(probeCode, {
      eval: true,
      execArgv: ['--experimental-vm-modules'],
      workerData: {
        directory,
        entry: 'assets/' + entryName,
        base,
        message: { requestId: 1, snapshot, request },
      },
    })
    let ticks = 0,
      startTicks = 0
    const heartbeat = setInterval(() => ticks++, 5)
    try {
      const { response, fetched } = await new Promise<{
        response: ResultMessage
        fetched: string[]
      }>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Browser Worker probe timed out')), 20000)
        worker.once('error', (error) => {
          clearTimeout(timeout)
          reject(error)
        })
        worker.on('message', (message) => {
          if (message.started) startTicks = ticks
          else {
            clearTimeout(timeout)
            resolve(message)
          }
        })
        worker.once('exit', (code) => {
          if (code) {
            clearTimeout(timeout)
            reject(new Error('Worker exited: ' + code))
          }
        })
      })
      const result = response.result
      if (
        response.requestId !== 1 ||
        result.status !== 'optimal' ||
        !result.lineup ||
        !result.evaluation ||
        'solutions' in result ||
        result.request.objective !== objective ||
        !evaluateLineup(snapshot, request, result.lineup).valid ||
        evaluateLineup(snapshot, request, result.lineup).objective !==
          result.evaluation.objective ||
        result.evaluation.completedCount !== 1 ||
        !fetched.length ||
        ticks <= startTicks
      )
        throw new Error(
          'Browser Worker probe returned an invalid result or no main-thread heartbeat',
        )
      console.log(
        JSON.stringify({
          base,
          status: result.status,
          objective,
          completed: result.evaluation.completedCount,
          roles: result.lineup.members.length,
          emblems: result.evaluation.emblemCount,
          wasm: fetched,
          mainThreadTicks: ticks - startTicks,
          note: 'Built browser code + real WASM in an isolated VM thread; not real-browser acceptance.',
        }),
      )
    } finally {
      clearInterval(heartbeat)
      await worker.terminate()
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error : String(error))
  process.exitCode = 1
})
