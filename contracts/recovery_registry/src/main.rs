#![no_std]
#![no_main]

extern crate alloc;

use alloc::{vec::Vec, vec, boxed::Box, format};
use alloc::string::ToString;
use casper_contract::{
    contract_api::{runtime, storage},
    unwrap_or_revert::UnwrapOrRevert,
};
use casper_types::{
    account::AccountHash, 
    contracts::NamedKeys, 
    ApiError, 
    CLType, 
    CLValue,
    EntryPoint, 
    EntryPointAccess, 
    EntryPointType, 
    EntryPoints, 
    Key, 
    Parameter,
    PublicKey, 
    U256,
    URef,
    CLTyped,
    bytesrepr::{FromBytes, ToBytes},
    AccessRights,
};

#[repr(u16)]
enum Err {
    NotOwner = 1,
    AlreadyInit = 2,
    BadGuardians = 3,
    BadThreshold = 4,
    NotGuardian = 5,
    RecoveryExists = 6,
    NotFound = 7,
    AlreadyApproved = 8,
    NotApproved = 9,
    NotInit = 10,
    MissingDict = 11,
}

impl From<Err> for ApiError {
    fn from(e: Err) -> Self { ApiError::User(e as u16) }
}

const DICT: &str = "d";

fn get_dict() -> URef {
    runtime::get_key(DICT)
        .unwrap_or_revert_with(Err::MissingDict)
        .into_uref()
        .unwrap_or_revert_with(Err::MissingDict)
}

fn read<T: CLTyped + FromBytes>(k: &str) -> Option<T> {
    storage::dictionary_get(get_dict(), k).unwrap_or(None)
}

fn write<T: CLTyped + ToBytes>(k: &str, v: T) {
    storage::dictionary_put(get_dict(), k, v);
}

#[no_mangle]
pub extern "C" fn init_guardians() {
    let acc: AccountHash = runtime::get_named_arg("account");
    let guards: Vec<AccountHash> = runtime::get_named_arg("guardians");
    let thresh: u8 = runtime::get_named_arg("threshold");

    if runtime::get_caller() != acc { runtime::revert(Err::NotOwner); }
    if guards.len() < 2 { runtime::revert(Err::BadGuardians); }
    if thresh == 0 || thresh as usize > guards.len() { runtime::revert(Err::BadThreshold); }

    let k = format!("i{:?}", acc);
    if read::<bool>(&k).unwrap_or(false) { runtime::revert(Err::AlreadyInit); }

    write(&format!("g{:?}", acc), guards);
    write(&format!("t{:?}", acc), thresh);
    write(&k, true);
}

#[no_mangle]
pub extern "C" fn start_recovery() {
    let acc: AccountHash = runtime::get_named_arg("account");
    let nk: PublicKey = runtime::get_named_arg("new_key");

    if !read::<bool>(&format!("i{:?}", acc)).unwrap_or(false) { runtime::revert(Err::NotInit); }
    if read::<U256>(&format!("a{:?}", acc)).is_some() { runtime::revert(Err::RecoveryExists); }

    let id = read::<U256>("c").unwrap_or(U256::zero()) + 1;
    write("c", id);
    write(&format!("ra{}", id), acc);
    write(&format!("rk{}", id), nk);
    write(&format!("rc{}", id), 0u8);
    write(&format!("ro{}", id), false);
    write(&format!("a{:?}", acc), id);

    runtime::ret(CLValue::from_t(id).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn approve() {
    let id: U256 = runtime::get_named_arg("id");
    let caller = runtime::get_caller();

    let acc: AccountHash = read(&format!("ra{}", id)).unwrap_or_revert_with(Err::NotFound);
    let guards: Vec<AccountHash> = read(&format!("g{:?}", acc)).unwrap_or_revert_with(Err::NotGuardian);

    if !guards.contains(&caller) { runtime::revert(Err::NotGuardian); }

    let ak = format!("rp{}_{:?}", id, caller);
    if read::<bool>(&ak).unwrap_or(false) { runtime::revert(Err::AlreadyApproved); }

    write(&ak, true);
    let cnt: u8 = read(&format!("rc{}", id)).unwrap_or(0) + 1;
    write(&format!("rc{}", id), cnt);

    let thresh: u8 = read(&format!("t{:?}", acc)).unwrap_or(2);
    if cnt >= thresh { write(&format!("ro{}", id), true); }
}

#[no_mangle]
pub extern "C" fn is_approved() {
    let id: U256 = runtime::get_named_arg("id");
    runtime::ret(CLValue::from_t(read::<bool>(&format!("ro{}", id)).unwrap_or(false)).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn finalize() {
    let id: U256 = runtime::get_named_arg("id");
    if !read::<bool>(&format!("ro{}", id)).unwrap_or(false) { runtime::revert(Err::NotApproved); }
}

#[no_mangle]
pub extern "C" fn get_guardians() {
    let acc: AccountHash = runtime::get_named_arg("account");
    let g: Vec<AccountHash> = read(&format!("g{:?}", acc)).unwrap_or_revert_with(Err::NotInit);
    runtime::ret(CLValue::from_t(g).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn has_guardians() {
    let acc: AccountHash = runtime::get_named_arg("account");
    runtime::ret(CLValue::from_t(read::<bool>(&format!("i{:?}", acc)).unwrap_or(false)).unwrap_or_revert());
}

#[no_mangle]
pub extern "C" fn call() {
    let mut eps = EntryPoints::new();

    eps.add_entry_point(EntryPoint::new(
        "init_guardians",
        vec![
            Parameter::new("account", CLType::ByteArray(32)),
            Parameter::new("guardians", CLType::List(Box::new(CLType::ByteArray(32)))),
            Parameter::new("threshold", CLType::U8),
        ],
        CLType::Unit, EntryPointAccess::Public, EntryPointType::Contract,
    ));

    eps.add_entry_point(EntryPoint::new(
        "start_recovery",
        vec![
            Parameter::new("account", CLType::ByteArray(32)),
            Parameter::new("new_key", CLType::PublicKey),
        ],
        CLType::U256, EntryPointAccess::Public, EntryPointType::Contract,
    ));

    eps.add_entry_point(EntryPoint::new(
        "approve", vec![Parameter::new("id", CLType::U256)],
        CLType::Unit, EntryPointAccess::Public, EntryPointType::Contract,
    ));

    eps.add_entry_point(EntryPoint::new(
        "is_approved", vec![Parameter::new("id", CLType::U256)],
        CLType::Bool, EntryPointAccess::Public, EntryPointType::Contract,
    ));

    eps.add_entry_point(EntryPoint::new(
        "finalize", vec![Parameter::new("id", CLType::U256)],
        CLType::Unit, EntryPointAccess::Public, EntryPointType::Contract,
    ));

    eps.add_entry_point(EntryPoint::new(
        "get_guardians", vec![Parameter::new("account", CLType::ByteArray(32))],
        CLType::List(Box::new(CLType::ByteArray(32))), EntryPointAccess::Public, EntryPointType::Contract,
    ));

    eps.add_entry_point(EntryPoint::new(
        "has_guardians", vec![Parameter::new("account", CLType::ByteArray(32))],
        CLType::Bool, EntryPointAccess::Public, EntryPointType::Contract,
    ));

    // Create URef with read/write/add access for dictionary operations
    let seed_uref = storage::new_uref(0u8);
    let dict_uref = URef::new(seed_uref.addr(), AccessRights::READ_ADD_WRITE);

    let mut nk = NamedKeys::new();
    nk.insert(DICT.to_string(), Key::URef(dict_uref));

    let (hash, _) = storage::new_locked_contract(eps, Some(nk), Some("rh".to_string()), Some("rc".to_string()));
    runtime::put_key("rh", Key::Hash(hash.value()));
}
