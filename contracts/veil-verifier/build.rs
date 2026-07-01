//! Build script: transcode a snarkjs `verification_key.json` into `vk.rs` (byte-array constants
//! embedded into the contract WASM). Point encoders inlined from Nethermind `circuit-keys`
//! (Apache-2.0): G1 = `x || y` (64B BE); G2 = `x.c1 || x.c0 || y.c1 || y.c0` (128B BE) — Soroban's
//! `c1||c0` ordering vs snarkjs's `[c0, c1]`.
//!
//! `VERIFIER_VK_JSON=circom/keys/<circuit>.vk.json cargo build -p veil-verifier`. When unset, a
//! zero placeholder key is emitted so `cargo check`/tests (which use the runtime `verify_with_vk`
//! path) still compile.

use std::{env, fmt::Write as _, fs, path::PathBuf};

use ark_bn254::{g1::G1Affine, g2::G2Affine};
use ark_ff::{BigInteger, PrimeField};
use num_bigint::BigUint;
use serde_json::Value;

fn main() {
    println!("cargo:rerun-if-env-changed=VERIFIER_VK_JSON");
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR not set"));

    let content = match env::var("VERIFIER_VK_JSON") {
        Ok(path) => {
            println!("cargo:rerun-if-changed={path}");
            let json = fs::read_to_string(&path)
                .unwrap_or_else(|e| panic!("failed to read VK file `{path}`: {e}"));
            vk_rs_from_json(&json)
        }
        Err(_) => {
            // Default to the committed BORROW vkey so `cargo test` always exercises the embedded-VK
            // path (`verify()` + build.rs transcoding) — audit H-01. DEPLOY always sets
            // VERIFIER_VK_JSON explicitly per circuit; this default is a test convenience only.
            let manifest = env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR not set");
            let default = PathBuf::from(&manifest).join("../../circom/keys/borrow.vk.json");
            if default.exists() {
                println!(
                    "cargo:warning=VERIFIER_VK_JSON unset — embedding default BORROW vkey (tests \
                     only; set VERIFIER_VK_JSON=circom/keys/<circuit>.vk.json for a real deploy)"
                );
                println!("cargo:rerun-if-changed={}", default.display());
                vk_rs_from_json(&fs::read_to_string(&default).expect("read default borrow vkey"))
            } else {
                placeholder_vk_rs()
            }
        }
    };
    fs::write(out_dir.join("vk.rs"), content).expect("failed to write vk.rs");
}

/// ark `BigInteger` → 32-byte big-endian, left-zero-padded.
fn bigint_to_be_32<B: BigInteger>(value: B) -> [u8; 32] {
    let bytes = value.to_bytes_be();
    let mut out = [0u8; 32];
    let start = 32usize.saturating_sub(bytes.len());
    out[start..].copy_from_slice(&bytes[..bytes.len().min(32)]);
    out
}

fn parse_fq(value: &str) -> ark_bn254::Fq {
    let bigint = BigUint::parse_bytes(value.as_bytes(), 10)
        .unwrap_or_else(|| panic!("invalid decimal field element: {value}"));
    ark_bn254::Fq::from_be_bytes_mod_order(&bigint.to_bytes_be())
}

/// snarkjs G1 `[x, y, "1"]` → 64 bytes (`x || y`).
fn g1_bytes(pt: &Value) -> [u8; 64] {
    let arr = pt.as_array().expect("G1 point must be a JSON array");
    let x = parse_fq(arr[0].as_str().expect("G1.x must be a string"));
    let y = parse_fq(arr[1].as_str().expect("G1.y must be a string"));
    let p = G1Affine::new_unchecked(x, y);
    let mut out = [0u8; 64];
    out[..32].copy_from_slice(&bigint_to_be_32(p.x.into_bigint()));
    out[32..].copy_from_slice(&bigint_to_be_32(p.y.into_bigint()));
    out
}

/// snarkjs G2 `[[x_c0, x_c1], [y_c0, y_c1], ...]` → 128 bytes (`x.c1 || x.c0 || y.c1 || y.c0`).
fn g2_bytes(pt: &Value) -> [u8; 128] {
    let arr = pt.as_array().expect("G2 point must be a JSON array");
    let x = arr[0].as_array().expect("G2.x must be a JSON array");
    let y = arr[1].as_array().expect("G2.y must be a JSON array");
    let xf = ark_bn254::Fq2::new(
        parse_fq(x[0].as_str().expect("G2.x.c0 must be a string")),
        parse_fq(x[1].as_str().expect("G2.x.c1 must be a string")),
    );
    let yf = ark_bn254::Fq2::new(
        parse_fq(y[0].as_str().expect("G2.y.c0 must be a string")),
        parse_fq(y[1].as_str().expect("G2.y.c1 must be a string")),
    );
    let p = G2Affine::new_unchecked(xf, yf);
    let mut out = [0u8; 128];
    out[..32].copy_from_slice(&bigint_to_be_32(p.x.c1.into_bigint()));
    out[32..64].copy_from_slice(&bigint_to_be_32(p.x.c0.into_bigint()));
    out[64..96].copy_from_slice(&bigint_to_be_32(p.y.c1.into_bigint()));
    out[96..].copy_from_slice(&bigint_to_be_32(p.y.c0.into_bigint()));
    out
}

fn fmt_bytes(bytes: &[u8]) -> String {
    let mut s = String::from("[");
    for (i, b) in bytes.iter().enumerate() {
        if i > 0 {
            s.push(',');
        }
        write!(s, "0x{b:02x}").expect("infallible");
    }
    s.push(']');
    s
}

fn vk_rs_from_json(json: &str) -> String {
    let v: Value = serde_json::from_str(json).expect("VK file is not valid JSON");
    let alpha = g1_bytes(&v["vk_alpha_1"]);
    let beta = g2_bytes(&v["vk_beta_2"]);
    let gamma = g2_bytes(&v["vk_gamma_2"]);
    let delta = g2_bytes(&v["vk_delta_2"]);
    let ic_arr = v["IC"].as_array().expect("IC must be a JSON array");
    let ic_len = ic_arr.len();
    let ic_items: Vec<String> = ic_arr.iter().map(|pt| fmt_bytes(&g1_bytes(pt))).collect();

    let mut out = String::new();
    writeln!(out, "// Auto-generated by build.rs — do not edit.").unwrap();
    writeln!(out, "const VK_ALPHA_G1: [u8; 64] = {};", fmt_bytes(&alpha)).unwrap();
    writeln!(out, "const VK_BETA_G2: [u8; 128] = {};", fmt_bytes(&beta)).unwrap();
    writeln!(out, "const VK_GAMMA_G2: [u8; 128] = {};", fmt_bytes(&gamma)).unwrap();
    writeln!(out, "const VK_DELTA_G2: [u8; 128] = {};", fmt_bytes(&delta)).unwrap();
    writeln!(out, "const VK_IC: [[u8; 64]; {ic_len}] = [{}];", ic_items.join(",")).unwrap();
    out
}

/// Zero placeholder (VERIFIER_VK_JSON unset): compiles, but `verify()` with it is meaningless —
/// tests exercise `verify_with_vk` with a runtime-built key instead.
fn placeholder_vk_rs() -> String {
    let z1 = fmt_bytes(&[0u8; 64]);
    let z2 = fmt_bytes(&[0u8; 128]);
    let mut out = String::new();
    writeln!(out, "// Placeholder VK (VERIFIER_VK_JSON unset).").unwrap();
    writeln!(out, "const VK_ALPHA_G1: [u8; 64] = {z1};").unwrap();
    writeln!(out, "const VK_BETA_G2: [u8; 128] = {z2};").unwrap();
    writeln!(out, "const VK_GAMMA_G2: [u8; 128] = {z2};").unwrap();
    writeln!(out, "const VK_DELTA_G2: [u8; 128] = {z2};").unwrap();
    writeln!(out, "const VK_IC: [[u8; 64]; 1] = [{z1}];").unwrap();
    out
}
