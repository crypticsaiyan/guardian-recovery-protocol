#![no_std]
#![no_main]

extern crate alloc;

use alloc::{string::ToString, vec};
use casper_contract::contract_api::runtime;
use casper_types::{contracts::NamedKeys, CLType, EntryPoint, EntryPointAccess, EntryPointType, EntryPoints, Key};

#[no_mangle]
pub extern "C" fn ping() {
    // Does nothing, just a test
}

#[no_mangle]
pub extern "C" fn call() {
    let mut entry_points = EntryPoints::new();
    
    entry_points.add_entry_point(EntryPoint::new(
        "ping",
        vec![],
        CLType::Unit,
        EntryPointAccess::Public,
        EntryPointType::Contract,
    ));

    let named_keys = NamedKeys::new();

    let (contract_hash, _) = casper_contract::contract_api::storage::new_locked_contract(
        entry_points,
        Some(named_keys),
        Some("test_contract_hash".to_string()),
        Some("test_contract".to_string()),
    );

    runtime::put_key("test_contract_hash", Key::Hash(contract_hash.value()));
}
