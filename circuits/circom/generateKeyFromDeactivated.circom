pragma circom 2.0.0;

include "./trees/incrementalQuinTree.circom";
include "./elGamalRerandomize.circom";
include "./isDeactivatedKey.circom";
include "./poseidon/poseidonHashT3.circom";
include "./hasherSha256.circom";
include "./privToPubKey.circom";


template GenerateKeyFromDeactivated(STATE_TREE_DEPTH) {
    var TREE_ARITY = 5;
    var STATE_LEAF_LENGTH = 4;

    signal input inputHash; // Hashed inputs
    
    // Private key of the deactivated key
    signal input oldPrivKey;

    // Number of signups
    signal input numSignUps;

    // State index of the old key
    signal input stateIndex;

    // Salt used for key deactivation
    signal input salt;

    // State tree root
    signal input stateTreeRoot;

    // Deactivated keys root
    signal input deactivatedKeysRoot;

    // State tree inclusion proof
    signal input stateTreeInclusionProof[STATE_TREE_DEPTH][TREE_ARITY - 1];

    // Old credit balance
    signal input oldCreditBalance;

    // New credit balance
    signal input newCreditBalance;

    // State leaf generation timestamp
    signal input stateLeafTimestamp;

    // Deactivated keys tree inclusion proof
    signal input deactivatedKeysInclusionProof[STATE_TREE_DEPTH][TREE_ARITY - 1];

    // Deactivated key index
    signal input deactivatedKeyIndex;

    // Deactivated key encrypted status
    signal input c1[2];
    signal input c2[2];

    // Coordinator's public key
    signal input coordinatorPubKey[2];

    // Rerandomized ciphertext
    signal input c1r[2];
    signal input c2r[2];

    // Rerandomization value
    signal input z;

    // Deactivation nullifier
    signal input nullifier;

    // ==============================================
    // 1. Generate old pub key
    component privToPub = PrivToPubKey();
    privToPub.privKey <== oldPrivKey;

    // 2. Construct old state leaf
    // [pubX, pubY, creditBalance, stateLeafTimestamp]
    signal stateLeaf[4];
    stateLeaf[0] <== privToPub.pubKey[0];
    stateLeaf[1] <== privToPub.pubKey[1];
    stateLeaf[2] <== oldCreditBalance;
    stateLeaf[3] <== stateLeafTimestamp;

    // 3. Create state tree leaf hash
    component stateLeafQip = QuinTreeInclusionProof(STATE_TREE_DEPTH);
    component stateLeafHasher = Hasher4();
    for (var i = 0; i < STATE_LEAF_LENGTH; i++) {
        stateLeafHasher.in[i] <== stateLeaf[i];
    }

    // 4. Verify state tree inclusion proof
    component validStateLeafIndex = LessEqThan(252);
    validStateLeafIndex.in[0] <== stateIndex;
    validStateLeafIndex.in[1] <== numSignUps;

    component indexMux = Mux1();
    indexMux.s <== validStateLeafIndex.out;
    indexMux.c[0] <== 0;
    indexMux.c[1] <== stateIndex;

    component stateLeafPathIndices = QuinGeneratePathIndices(STATE_TREE_DEPTH);
    stateLeafPathIndices.in <== indexMux.out;
    
    stateLeafQip.leaf <== stateLeafHasher.hash;
    for (var i = 0; i < STATE_TREE_DEPTH; i ++) {
        stateLeafQip.path_index[i] <== stateLeafPathIndices.out[i];
        for (var j = 0; j < TREE_ARITY - 1; j++) {
            stateLeafQip.path_elements[i][j] <== stateTreeInclusionProof[i][j];
        }
    }

    stateLeafQip.root === stateTreeRoot;

    // 5. Verify new balance value
    component isValidBalance = LessEqThan(252);
    isValidBalance.in[0] <== newCreditBalance;
    isValidBalance.in[1] <== oldCreditBalance;
    isValidBalance.out === 1;

    // 6. Verify deactivated key inclusion proof
    component deactLeafPathIndices = QuinGeneratePathIndices(STATE_TREE_DEPTH);
    deactLeafPathIndices.in <== deactivatedKeyIndex;

    component isInDeactivated = IsDeactivatedKey(STATE_TREE_DEPTH);
    isInDeactivated.root <== deactivatedKeysRoot;
    isInDeactivated.key[0] <== stateLeaf[0];
    isInDeactivated.key[1] <== stateLeaf[1];
    isInDeactivated.c1[0] <== c1[0];
    isInDeactivated.c1[1] <== c1[1];
    isInDeactivated.c2[0] <== c2[0];
    isInDeactivated.c2[1] <== c2[1];
    isInDeactivated.salt <== salt;

    for (var i = 0; i < STATE_TREE_DEPTH; i ++) {
        isInDeactivated.path_index[i] <== deactLeafPathIndices.out[i];
        for (var j = 0; j < TREE_ARITY - 1; j++) {
            isInDeactivated.path_elements[i][j] <== deactivatedKeysInclusionProof[i][j];
        }
    }

    isInDeactivated.isDeactivated === 1;

    // 7. Verify nullifier construction 
    // hash(oldPrivKey, salt)
    component nullifierHasher = PoseidonHashT3();
    nullifierHasher.inputs[0] <== oldPrivKey;
    nullifierHasher.inputs[1] <== salt;
    nullifierHasher.out === nullifier;

    // 8. Verify rerandomized values
    component rerandomize = ElGamalRerandomize();
    rerandomize.z <== z;
    rerandomize.pubKey[0] <== coordinatorPubKey[0];
    rerandomize.pubKey[1] <== coordinatorPubKey[1];
    rerandomize.c1[0] <== c1[0];
    rerandomize.c1[1] <== c1[1];
    rerandomize.c2[0] <== c2[0];
    rerandomize.c2[1] <== c2[1];

    rerandomize.c1r[0] === c1r[0];
    rerandomize.c1r[1] === c1r[1];
    rerandomize.c2r[0] === c2r[0];
    rerandomize.c2r[1] === c2r[1];
    
    // 9. Verify output hash
    component inputHasher = Sha256Hasher(7);
    inputHasher.in[0] <== stateTreeRoot;
    inputHasher.in[1] <== deactivatedKeysRoot;
    inputHasher.in[2] <== nullifier;
    inputHasher.in[3] <== c1r[0];
    inputHasher.in[4] <== c1r[1];
    inputHasher.in[5] <== c2r[0];
    inputHasher.in[6] <== c2r[1];

    inputHasher.hash === inputHash;
}
