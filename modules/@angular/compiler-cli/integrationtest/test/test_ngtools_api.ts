#!/usr/bin/env node
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
/* tslint:disable:no-console  */

// Must be imported first, because angular2 decorators throws on load.
import 'reflect-metadata';

import * as path from 'path';
import * as ts from 'typescript';
import * as assert from 'assert';
import {tsc} from '@angular/tsc-wrapped/src/tsc';
import {AngularCompilerOptions, CodeGenerator, CompilerHostContext, NodeCompilerHostContext, __NGTOOLS_PRIVATE_API_2} from '@angular/compiler-cli';

const glob = require('glob');


/**
 * Main method.
 * Standalone program that executes codegen using the ngtools API and tests that files were
 * properly read and wrote.
 */
function main() {
  console.log(`testing ngtools API...`);

  Promise.resolve()
      .then(() => codeGenTest())
      .then(() => lazyRoutesTest())
      .then(() => {
        console.log('All done!');
        process.exit(0);
      })
      .catch((err) => {
        console.error(err.stack);
        console.error('Test failed');
        process.exit(1);
      });
}


function codeGenTest() {
  const basePath = path.join(__dirname, '../ngtools_src');
  const project = path.join(basePath, 'tsconfig-build.json');
  const readResources: string[] = [];
  const wroteFiles: string[] = [];

  const config = tsc.readConfiguration(project, basePath);
  const hostContext = new NodeCompilerHostContext();
  const delegateHost = ts.createCompilerHost(config.parsed.options, true);
  const host: ts.CompilerHost = Object.assign({}, delegateHost, {
    writeFile: (fileName: string, ...rest: any[]) => {
      wroteFiles.push(fileName);
      return delegateHost.writeFile.call(delegateHost, fileName, ...rest);
    }
  });
  const program = ts.createProgram(config.parsed.fileNames, config.parsed.options, host);

  config.ngOptions.basePath = basePath;

  console.log(`>>> running codegen for ${project}`);
  return __NGTOOLS_PRIVATE_API_2
      .codeGen({
        basePath,
        compilerOptions: config.parsed.options, program, host,

        angularCompilerOptions: config.ngOptions,

        // i18n options.
        i18nFormat: null,
        i18nFile: null,
        locale: null,

        readResource: (fileName: string) => {
          readResources.push(fileName);
          return hostContext.readResource(fileName);
        }
      })
      .then(() => {
        console.log(`>>> codegen done, asserting read and wrote files`);

        // Assert for each file that it has been read and each `ts` has a written file associated.
        const allFiles = glob.sync(path.join(basePath, '**/*'), {nodir: true});

        allFiles.forEach((fileName: string) => {
          // Skip tsconfig.
          if (fileName.match(/tsconfig-build.json$/)) {
            return;
          }

          // Assert that file was read.
          if (fileName.match(/\.module\.ts$/)) {
            const factory = fileName.replace(/\.module\.ts$/, '.module.ngfactory.ts');
            assert(wroteFiles.indexOf(factory) != -1, `Expected file "${factory}" to be written.`);
          } else if (fileName.match(/\.css$/) || fileName.match(/\.html$/)) {
            assert(
                readResources.indexOf(fileName) != -1,
                `Expected resource "${fileName}" to be read.`);
          }
        });

        console.log(`done, no errors.`);
      })
      .catch((e: any) => {
        console.error(e.stack);
        console.error('Compilation failed');
        throw e;
      });
}


function lazyRoutesTest() {
  const basePath = path.join(__dirname, '../ngtools_src');
  const project = path.join(basePath, 'tsconfig-build.json');

  const config = tsc.readConfiguration(project, basePath);
  const host = ts.createCompilerHost(config.parsed.options, true);
  const program = ts.createProgram(config.parsed.fileNames, config.parsed.options, host);

  config.ngOptions.basePath = basePath;

  const lazyRoutes = __NGTOOLS_PRIVATE_API_2.listLazyRoutes({
    program,
    host,
    angularCompilerOptions: config.ngOptions,
    entryModule: 'app.module#AppModule'
  });

  const expectations: {[route: string]: string} = {
    './lazy.module#LazyModule': 'lazy.module.ts',
    './feature/feature.module#FeatureModule': 'feature/feature.module.ts',
    './feature/lazy-feature.module#LazyFeatureModule': 'feature/lazy-feature.module.ts',
    'feature2/feature2.module#Feature2Module': 'feature2/feature2.module.ts',
    './default.module': 'feature2/default.module.ts',
    'feature/feature.module#FeatureModule': 'feature/feature.module.ts'
  };

  Object.keys(lazyRoutes).forEach((route: string) => {
    assert(route in expectations, `Found a route that was not expected: "${route}".`);
    assert(
        lazyRoutes[route] == path.join(basePath, expectations[route]),
        `Route "${route}" does not point to the expected absolute path ` +
            `"${path.join(basePath, expectations[route])}". It points to "${lazyRoutes[route]}"`);
  });

  // Verify that all expectations were met.
  assert.deepEqual(
      Object.keys(lazyRoutes), Object.keys(expectations), `Expected routes listed to be: \n` +
          `  ${JSON.stringify(Object.keys(expectations))}\n` +
          `Actual:\n` +
          `  ${JSON.stringify(Object.keys(lazyRoutes))}\n`);
}

main();
