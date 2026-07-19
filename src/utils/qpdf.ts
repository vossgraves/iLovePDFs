/**
 * qpdf CLI (WASM) wrapper — lazy singleton.
 * Used for real AES-256 encryption (Protect) and password decryption (Unlock).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QpdfModule = any;

let qpdfPromise: Promise<QpdfModule> | null = null;

async function initQpdf(): Promise<QpdfModule> {
    const [{ default: init }, wasmModule] = await Promise.all([
        import('@jspawn/qpdf-wasm'),
        import('@jspawn/qpdf-wasm/qpdf.wasm?url')
    ]);

    const wasmUrl = (wasmModule as { default: string }).default;
    return init({ locateFile: (file: string) => (file.endsWith('.wasm') ? wasmUrl : file) });
}

function getQpdf(): Promise<QpdfModule> {
    if (!qpdfPromise) {
        qpdfPromise = initQpdf().catch(err => {
            qpdfPromise = null;
            throw err;
        });
    }
    return qpdfPromise;
}

/** Runs the qpdf CLI with one input file; returns the output file bytes. */
export async function runQpdf(args: string[], inputName: string, inputBytes: ArrayBuffer): Promise<Uint8Array> {
    const qpdf = await getQpdf();

    try {
        qpdf.FS.mkdir('/work');
    } catch {
        // already exists from a previous run
    }

    qpdf.FS.writeFile(`/work/${inputName}`, new Uint8Array(inputBytes));
    const outputPath = '/work/output.pdf';

    // previous outputs must not leak into this run
    try {
        qpdf.FS.unlink(outputPath);
    } catch {
        // didn't exist
    }

    const finalArgs = args.map(a => a.replace('{in}', `/work/${inputName}`).replace('{out}', outputPath));

    let exitError: unknown = null;
    try {
        qpdf.callMain(finalArgs);
    } catch (err) {
        exitError = err;
    }

    let output: Uint8Array | null = null;
    try {
        output = qpdf.FS.readFile(outputPath) as Uint8Array;
    } catch {
        output = null;
    }

    if (!output || output.length === 0) {
        throw new Error(
            exitError
                ? 'qpdf failed — the password may be wrong or the file unsupported.'
                : 'qpdf produced no output.'
        );
    }

    return output;
}

/** AES-256 encrypt: user password opens the file, owner password controls permissions. */
export function encryptPdf(bytes: ArrayBuffer, userPassword: string, ownerPassword: string): Promise<Uint8Array> {
    return runQpdf(
        ['--encrypt', userPassword, ownerPassword || userPassword, '256', '--', '{in}', '{out}'],
        'input.pdf',
        bytes
    );
}

/** Decrypt with a supplied password (removes open-password protection). */
export function decryptPdf(bytes: ArrayBuffer, password: string): Promise<Uint8Array> {
    return runQpdf(
        ['--password=' + password, '--decrypt', '--', '{in}', '{out}'],
        'input.pdf',
        bytes
    );
}
