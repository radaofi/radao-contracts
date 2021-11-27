// @dev. This script will deploy this V1.1 of Olympus. It will deploy the whole ecosystem except for the LP tokens and their bonds. 
// This should be enough of a test environment to learn about and test implementations with the Olympus as of V1.1.
// Not that the every instance of the Treasury's function 'valueOf' has been changed to 'valueOfToken'... 
// This solidity function was conflicting w js object property name

const { ethers } = require("hardhat");
const { BigNumber } = ethers
const UniswapV2ABI = require('./IUniswapV2Factory.json').abi
const IUniswapV2Pair = require('./IUniswapV2Pair.json').abi

async function main() {

    const [deployer] = await ethers.getSigners();
    const MockDAO = "0xe67c8Ec77973eBc7e25D2631E45e8d1663f2c9f5"
    console.log('Deploying contracts with the account: ' + deployer.address);

    // Initial staking index
    const initialIndex = '1000000000';

    const blockNumber = await ethers.provider.getBlockNumber()
    // First block epoch occurs
    const firstEpochBlock = "12990000";

    // What epoch will be first epoch
    const firstEpochNumber = '1';

    // How many blocks are in each epoch
    const epochLengthInBlocks = '9600';

    // Initial reward rate for epoch
    const initialRewardRate = '1200';

    // Ethereum 0 address, used when toggling changes in treasury
    const zeroAddress = '0x0000000000000000000000000000000000000000';

    // Large number for approval for Frax and DAI
    const largeApproval = '100000000000000000000000000000000';

    // DAI bond BCV
    const daiBondBCV = '200';

    // Bond vesting length in blocks. 33110 ~ 5 days
    const bondVestingLength = '144000';

    // Min bond price
    const minBondPrice = '0';

    // Max bond payout
    const maxBondPayout = '40'

    // DAO fee for bond
    const bondFee = '10000';

    // Max debt bond can take on
    const maxBondDebt = '1000000000000000000';

    // Initial Bond debt
    const intialBondDebt = '0'

    // Deploy RA
    const RA = await ethers.getContractFactory('RaERC20Token');
    // const ra = await RA.deploy();
    const ra = RA.attach("0xc0eD1f391a38028D75Fea566dcab160EcA784f6a");
    console.log("RA Contract: ", ra.address);

    // Deploy BUSD
    const BUSD = await ethers.getContractFactory('BUSD');
    // const busd = await BUSD.deploy("97");
    const busd = BUSD.attach("0xe9e7cea3dedca5984780bafc599bd69add087d56")
    console.log("BUSD Contract: ", busd.address);
    
    const uniswapFactoryAddr = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73"
    const uniswapFactory = new ethers.Contract(
        uniswapFactoryAddr,
        UniswapV2ABI,
        deployer
    )
    await (await uniswapFactory.createPair(ra.address, busd.address)).wait()
    const lpAddress = await uniswapFactory.getPair(ra.address, busd.address)
    console.log('LP created: ' + lpAddress)

    // Deploy treasury
    const Treasury = await ethers.getContractFactory('RaTreasury'); 
    const treasury = await Treasury.deploy(ra.address, busd.address, lpAddress, 0);
    console.log("Treasury Contract: ", treasury.address);

    // Deploy bonding calc
    const BondingCalculator = await ethers.getContractFactory('BondingCalculator');
    const bondingCalculator = await BondingCalculator.deploy( ra.address );
    console.log("BondingCalculator Contract: ", bondingCalculator.address);

    // Deploy staking distributor
    const Distributor = await ethers.getContractFactory('Distributor');
    const distributor = await Distributor.deploy(treasury.address, ra.address, epochLengthInBlocks, firstEpochBlock);
    console.log("Distributor Contract: ", distributor.address);

    // Deploy sRA
    const SRA = await ethers.getContractFactory('sRaERC20Token');
    const sRA = await SRA.deploy();
    console.log("sRA Contract: ", sRA.address);

    // Deploy Staking
    const Staking = await ethers.getContractFactory('RaStaking');
    const staking = await Staking.deploy(ra.address, sRA.address, epochLengthInBlocks, firstEpochNumber, firstEpochBlock);
    console.log("Staking Contract: ", staking.address);

    // Deploy staking warmpup
    const StakingWarmpup = await ethers.getContractFactory('StakingWarmup');
    const stakingWarmup = await StakingWarmpup.deploy(staking.address, sRA.address);
    console.log("StakingWarmpup Contract: ", stakingWarmup.address);

    // Deploy staking helper
    const StakingHelper = await ethers.getContractFactory('StakingHelper');
    const stakingHelper = await StakingHelper.deploy(staking.address, ra.address);
    console.log("StakingHelper Contract: ", stakingHelper.address);

    // Deploy BUSD bond
    const BUSDBond = await ethers.getContractFactory('BondDepository');
    const busdBond = await BUSDBond.deploy(ra.address, busd.address, treasury.address, MockDAO, zeroAddress);
    console.log("BUSDBond Contract: ", busdBond.address);

    const BUSDRABond = await ethers.getContractFactory('BondDepository')
    const busdRABond = await BUSDRABond.deploy(
        ra.address,
        lpAddress,
        treasury.address,
        MockDAO,
        bondingCalculator.address
    )
    console.log('BUSDRABond Contract: ' + busdRABond.address)

    // Deploy redeem helper
    const RedemmHelper = await ethers.getContractFactory('RedeemHelper');
    const redemmHelper = await RedemmHelper.deploy();
    console.log("RedemmHelper Contract: ", redemmHelper.address);

    await redemmHelper.addBondContract(busdBond.address);
    await redemmHelper.addBondContract(busdRABond.address);

    // Deploy RACirculatingSupply helper
    const RACirculatingSupply = await ethers.getContractFactory('RACirculatingSupplyConrtact');
    const rACirculatingSupply = await RACirculatingSupply.deploy(deployer.address);
    console.log("RACirculatingSupply Contract: ", rACirculatingSupply.address);
    await rACirculatingSupply.initialize(ra.address);

    // queue and toggle DAI and BUSD bond reserve depositor
    await(await treasury.queue('0', busdBond.address)).wait()
    await(await treasury.queue('4', busdRABond.address)).wait()
    await treasury.toggle('0', busdBond.address, zeroAddress);
    await treasury.toggle('4', busdRABond.address, zeroAddress);
    console.log("Queue - Toggle Bond");

    // Set DAI and BUSD bond terms
    await busdBond.initializeBondTerms(daiBondBCV, bondVestingLength, minBondPrice, maxBondPayout, bondFee, maxBondDebt, intialBondDebt);
    await busdRABond.initializeBondTerms("95", bondVestingLength, minBondPrice, 50, bondFee, "900000000000000000000", intialBondDebt);

    // Set staking for DAI and Frax bond
    await busdRABond.setStaking(staking.address, stakingHelper.address);
    await busdBond.setStaking(staking.address, stakingHelper.address);
    console.log("Bonds Set Staking");

    // Initialize sOHM and set the index
    await sRA.initialize(staking.address);
    await sRA.setIndex(initialIndex);
    console.log("Staked RA Init");

    // set distributor contract and warmup contract
    await staking.setContract('0', distributor.address);
    await staking.setContract('1', stakingWarmup.address);
    console.log("Staking Set Contract");

    // Add staking contract as distributor recipient
    await distributor.addRecipient(staking.address, initialRewardRate);
    console.log("Distributor addRecipient");

    // queue and toggle reward manager
    let tx = await treasury.queue('8', distributor.address);
    await tx.wait(1)
    await treasury.toggle('8', distributor.address, zeroAddress);
    console.log("Treasury Queue - Toggle Distributor");

    // queue and toggle deployer reserve depositor
    tx = await treasury.queue('0', deployer.address);
    await tx.wait(1)
    await treasury.toggle('0', deployer.address, zeroAddress);
    console.log("Treasury Queue - Toggle Token depositor");

    // queue and toggle liquidity depositor
    tx = await treasury.queue('4', deployer.address,);
    await tx.wait(1)
    await treasury.toggle('4', deployer.address, zeroAddress);
    console.log("Treasury Queue - Toggle Liquid depositor");

    const lp = new ethers.Contract(lpAddress, IUniswapV2Pair, deployer)

    // Approve the treasury to spend DAI and Frax
    await lp.approve(treasury.address, largeApproval );
    await busd.approve(treasury.address, largeApproval);
    console.log("Approve Stable Coin for Treasury");

    // Approve dai and frax bonds to spend deployer's DAI and Frax
    await lp.approve(busdRABond.address, largeApproval );
    await busd.approve(busdBond.address, largeApproval);
    console.log("Approve Stable Coin for Bond");

    // Approve staking and staking helper contact to spend deployer's RA
    await ra.approve(staking.address, largeApproval);
    await ra.approve(stakingHelper.address, largeApproval);
    console.log("Approve RA Token");

    // Set treasury for OHM token
    tx = await ra.setVault(deployer.address);
    await tx.wait(1)
    console.log("RA Token Set Vault For Deployer");
    tx = await ra.mint(deployer.address, 11000 * 10 ** 9)
    await tx.wait(1)
    console.log("RA Token Mint For Deployer");
    // Set treasury for OHM token
    await ra.setVault(treasury.address);
    console.log("RA Token Set Vault");

    // const lpRAAmount = 50000
    // const initialAxePriceInLP = 0.6
    // tx = await ra.transfer(
    //     lpAddress,
    //     BigNumber.from(lpRAAmount).mul(BigNumber.from(10).pow(9))
    // )
    // tx1 = await dai.transfer(
    //         lpAddress,
    //         BigNumber.from(lpRAAmount * initialAxePriceInLP).mul(
    //         BigNumber.from(10).pow(18)
    //     )
    // )
    // await Promise.all([tx.wait(), tx1.wait()])
    // console.log("Deposit to LP");
    // await (await lp.mint(deployer.address)).wait()
    // console.log("mint lp")

    // // deposit lp bond with full profit
    // const lpBalance = await lp.balanceOf(deployer.address)
    // const valueOfLPToken = await treasury.valueOf(lpAddress, lpBalance)
    // await (await treasury.deposit(lpBalance, lpAddress, valueOfLPToken)).wait(1)
    // console.log("deposit lp bond with full profit")
}

main()
    .then(() => process.exit())
    .catch(error => {
        console.error(error);
        process.exit(1);
})