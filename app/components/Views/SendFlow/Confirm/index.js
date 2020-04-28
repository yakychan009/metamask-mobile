import React, { PureComponent } from 'react';
import { colors, baseStyles, fontStyles } from '../../../../styles/common';
import {
	InteractionManager,
	StyleSheet,
	SafeAreaView,
	View,
	Alert,
	Text,
	ScrollView,
	TouchableOpacity,
	ActivityIndicator
} from 'react-native';
import { connect } from 'react-redux';
import { getSendFlowTitle } from '../../../UI/Navbar';
import { AddressFrom, AddressTo } from '../AddressInputs';
import PropTypes from 'prop-types';
import {
	renderFromWei,
	renderFromTokenMinimalUnit,
	weiToFiat,
	balanceToFiat,
	weiToFiatNumber,
	balanceToFiatNumber,
	renderFiatAddition,
	toWei
} from '../../../../util/number';
import { getTicker, decodeTransferData } from '../../../../util/transactions';
import StyledButton from '../../../UI/StyledButton';
import { hexToBN, BNToHex } from 'gaba/dist/util';
import { prepareTransaction } from '../../../../actions/newTransaction';
import { fetchBasicGasEstimates, convertApiValueToGWEI } from '../../../../util/custom-gas';
import Engine from '../../../../core/Engine';
import Logger from '../../../../util/Logger';
import TransactionReviewFeeCard from '../../../UI/TransactionReview/TransactionReviewFeeCard';
import CustomGas from '../CustomGas';
import ErrorMessage from '../ErrorMessage';
import TransactionsNotificationManager from '../../../../core/TransactionsNotificationManager';
import { strings } from '../../../../../locales/i18n';
import collectiblesTransferInformation from '../../../../util/collectibles-transfer';
import CollectibleImage from '../../../UI/CollectibleImage';
import Modal from 'react-native-modal';
import IonicIcon from 'react-native-vector-icons/Ionicons';
import TransactionTypes from '../../../../core/TransactionTypes';
import TransactionSummary from '../../TransactionSummary';
import Analytics from '../../../../core/Analytics';
import { ANALYTICS_EVENT_OPTS } from '../../../../util/analytics';
import Device from '../../../../util/Device';

const {
	CUSTOM_GAS: { AVERAGE_GAS, FAST_GAS, LOW_GAS }
} = TransactionTypes;

const styles = StyleSheet.create({
	wrapper: {
		flex: 1,
		backgroundColor: colors.white
	},
	inputWrapper: {
		flex: 0,
		borderBottomWidth: 1,
		borderBottomColor: colors.grey050,
		paddingHorizontal: 8
	},
	amountWrapper: {
		flexDirection: 'column',
		margin: 24
	},
	textAmountLabel: {
		...fontStyles.normal,
		fontSize: 14,
		textAlign: 'center',
		color: colors.grey500,
		textTransform: 'uppercase',
		marginVertical: 3
	},
	textAmount: {
		fontFamily: 'Roboto-Light',
		fontWeight: fontStyles.light.fontWeight,
		color: colors.black,
		fontSize: 44,
		textAlign: 'center'
	},
	buttonNext: {
		flex: 1,
		marginHorizontal: 24,
		alignSelf: 'flex-end'
	},
	buttonNextWrapper: {
		flexDirection: 'row',
		alignItems: 'flex-end',
		marginBottom: 16
	},
	actionTouchable: {
		padding: 12
	},
	actionText: {
		...fontStyles.normal,
		color: colors.blue,
		fontSize: 14,
		alignSelf: 'center'
	},
	actionsWrapper: {
		margin: 24
	},
	customGasModalTitle: {
		borderBottomColor: colors.grey100,
		borderBottomWidth: 1
	},
	customGasModalTitleText: {
		...fontStyles.bold,
		color: colors.black,
		fontSize: 18,
		alignSelf: 'center',
		margin: 16
	},
	customGasWrapper: {
		backgroundColor: colors.white,
		minHeight: '90%',
		borderTopLeftRadius: 10,
		borderTopRightRadius: 10,
		paddingBottom: Device.isIphoneX() ? 20 : 0
	},
	errorMessageWrapper: {
		marginTop: 16,
		marginHorizontal: 24
	},
	collectibleImageWrapper: {
		flexDirection: 'column',
		alignItems: 'center',
		margin: 16
	},
	collectibleName: {
		...fontStyles.normal,
		fontSize: 18,
		color: colors.black,
		textAlign: 'center'
	},
	collectibleTokenId: {
		...fontStyles.normal,
		fontSize: 12,
		color: colors.grey500,
		marginTop: 8,
		textAlign: 'center'
	},
	collectibleImage: {
		height: 120,
		width: 120
	},
	qrCode: {
		marginBottom: 16,
		paddingHorizontal: 36,
		paddingBottom: 24,
		paddingTop: 16,
		backgroundColor: colors.grey000,
		borderRadius: 8,
		width: '100%'
	},
	hexDataWrapper: {
		padding: 10,
		alignItems: 'center'
	},
	addressTitle: {
		...fontStyles.bold,
		color: colors.black,
		alignItems: 'center',
		justifyContent: 'center',
		textAlign: 'center',
		fontSize: 16,
		marginBottom: 16
	},
	hexDataClose: {
		zIndex: 999,
		position: 'absolute',
		top: 12,
		right: 20
	},
	hexDataText: {
		textAlign: 'justify'
	},
	bottomModal: {
		justifyContent: 'flex-end',
		margin: 0
	}
});

/**
 * View that wraps the wraps the "Send" screen
 */
class Confirm extends PureComponent {
	static navigationOptions = ({ navigation }) => getSendFlowTitle('send.confirm', navigation);

	static propTypes = {
		/**
		 * Object that represents the navigator
		 */
		navigation: PropTypes.object,
		/**
		 * Map of accounts to information objects including balances
		 */
		accounts: PropTypes.object,
		/**
		 * Object containing token balances in the format address => balance
		 */
		contractBalances: PropTypes.object,
		/**
		 * Current provider ticker
		 */
		ticker: PropTypes.string,
		/**
		 * Current transaction state
		 */
		transactionState: PropTypes.object,
		/**
		 * ETH to current currency conversion rate
		 */
		conversionRate: PropTypes.number,
		/**
		 * Currency code of the currently-active currency
		 */
		currentCurrency: PropTypes.string,
		/**
		 * Object containing token exchange rates in the format address => exchangeRate
		 */
		contractExchangeRates: PropTypes.object,
		/**
		 * Set transaction object to be sent
		 */
		prepareTransaction: PropTypes.func,
		/**
		 * Network id
		 */
		network: PropTypes.string,
		/**
		 * Indicates whether hex data should be shown in transaction editor
		 */
		showHexData: PropTypes.bool,
		/**
		 * Network provider type as mainnet
		 */
		providerType: PropTypes.string,
		/**
		 * ETH or fiat, depending on user setting
		 */
		primaryCurrency: PropTypes.string
	};

	state = {
		customGasModalVisible: false,
		currentCustomGasSelected: 'average',
		customGasSelected: 'average',
		gasEstimationReady: false,
		customGas: undefined,
		customGasPrice: undefined,
		fromAccountBalance: undefined,
		hexDataModalVisible: false,
		gasError: undefined,
		transactionValue: undefined,
		transactionValueFiat: undefined,
		transactionFee: undefined,
		transactionTotalAmount: undefined,
		transactionTotalAmountFiat: undefined,
		errorMessage: undefined
	};

	componentDidMount = async () => {
		// For analytics
		const { navigation, providerType } = this.props;
		navigation.setParams({ providerType });
		this.parseTransactionData();
		this.prepareTransaction();
	};

	parseTransactionData = () => {
		const {
			accounts,
			contractBalances,
			contractExchangeRates,
			conversionRate,
			currentCurrency,
			transactionState: {
				selectedAsset,
				transactionTo: to,
				transaction: { from, value, gas, gasPrice, data }
			},
			ticker
		} = this.props;
		let fromAccountBalance,
			transactionValue,
			transactionValueFiat,
			transactionTo,
			transactionTotalAmount,
			transactionTotalAmountFiat;
		const weiTransactionFee = gas && gas.mul(gasPrice);
		const valueBN = hexToBN(value);
		const transactionFeeFiat = weiToFiat(weiTransactionFee, conversionRate, currentCurrency);
		const parsedTicker = getTicker(ticker);
		const transactionFee = `${renderFromWei(weiTransactionFee)} ${parsedTicker}`;

		if (selectedAsset.isETH) {
			fromAccountBalance = `${renderFromWei(accounts[from].balance)} ${parsedTicker}`;
			transactionValue = `${renderFromWei(value)} ${parsedTicker}`;
			transactionValueFiat = weiToFiat(valueBN, conversionRate, currentCurrency);
			const transactionTotalAmountBN = weiTransactionFee && weiTransactionFee.add(valueBN);
			transactionTotalAmount = `${renderFromWei(transactionTotalAmountBN)} ${parsedTicker}`;
			transactionTotalAmountFiat = weiToFiat(transactionTotalAmountBN, conversionRate, currentCurrency);
			transactionTo = to;
		} else if (selectedAsset.tokenId) {
			fromAccountBalance = `${renderFromWei(accounts[from].balance)} ${parsedTicker}`;
			const collectibleTransferInformation =
				selectedAsset.address.toLowerCase() in collectiblesTransferInformation &&
				collectiblesTransferInformation[selectedAsset.address.toLowerCase()];
			if (
				!collectibleTransferInformation ||
				(collectibleTransferInformation.tradable && collectibleTransferInformation.method === 'transferFrom')
			) {
				[, transactionTo] = decodeTransferData('transferFrom', data);
			} else if (
				collectibleTransferInformation.tradable &&
				collectibleTransferInformation.method === 'transfer'
			) {
				[transactionTo, ,] = decodeTransferData('transfer', data);
			}
			transactionValueFiat = weiToFiat(valueBN, conversionRate, currentCurrency);
			const transactionTotalAmountBN = weiTransactionFee && weiTransactionFee.add(valueBN);
			transactionTotalAmount = `${renderFromWei(weiTransactionFee)} ${parsedTicker}`;
			transactionTotalAmountFiat = weiToFiat(transactionTotalAmountBN, conversionRate, currentCurrency);
		} else {
			let amount;
			const { address, symbol = 'ERC20', decimals } = selectedAsset;
			fromAccountBalance = `${renderFromTokenMinimalUnit(contractBalances[address], decimals)} ${symbol}`;
			[transactionTo, , amount] = decodeTransferData('transfer', data);
			const transferValue = renderFromTokenMinimalUnit(amount, decimals);
			transactionValue = `${transferValue} ${symbol}`;
			const exchangeRate = contractExchangeRates[address];
			const transactionFeeFiatNumber = weiToFiatNumber(weiTransactionFee, conversionRate);
			transactionValueFiat =
				balanceToFiat(transferValue, conversionRate, exchangeRate, currentCurrency) || `0 ${currentCurrency}`;
			const transactionValueFiatNumber = balanceToFiatNumber(transferValue, conversionRate, exchangeRate);
			transactionTotalAmount = `${transactionValue} + ${renderFromWei(weiTransactionFee)} ${parsedTicker}`;
			transactionTotalAmountFiat = renderFiatAddition(
				transactionValueFiatNumber,
				transactionFeeFiatNumber,
				currentCurrency
			);
		}
		this.setState({
			fromAccountBalance,
			transactionValue,
			transactionValueFiat,
			transactionFeeFiat,
			transactionFee,
			transactionTo,
			transactionTotalAmount,
			transactionTotalAmountFiat
		});
	};

	prepareTransaction = async () => {
		const {
			prepareTransaction,
			transactionState: { transaction }
		} = this.props;
		const estimation = await this.estimateGas(transaction);
		prepareTransaction({ ...transaction, ...estimation });
		this.parseTransactionData();
		this.setState({ gasEstimationReady: true });
	};

	estimateGas = async transaction => {
		const { TransactionController } = Engine.context;
		const { value, data, to, from } = transaction;
		let estimation;
		try {
			estimation = await TransactionController.estimateGas({
				value,
				from,
				data,
				to
			});
		} catch (e) {
			estimation = { gas: TransactionTypes.CUSTOM_GAS.DEFAULT_GAS_LIMIT };
		}
		let basicGasEstimates;
		try {
			basicGasEstimates = await fetchBasicGasEstimates();
		} catch (error) {
			Logger.log('Error while trying to get gas limit estimates', error);
			basicGasEstimates = { average: AVERAGE_GAS, safeLow: LOW_GAS, fast: FAST_GAS };
		}
		return {
			gas: hexToBN(estimation.gas),
			gasPrice: toWei(convertApiValueToGWEI(basicGasEstimates.average), 'gwei')
		};
	};

	handleGasFeeSelection = ({ gas, gasPrice, customGasSelected, error }) => {
		this.setState({ customGas: gas, customGasPrice: gasPrice, customGasSelected, gasError: error });
	};

	handleSetGasFee = () => {
		const { customGas, customGasPrice, customGasSelected } = this.state;
		if (!customGas || !customGasPrice) {
			this.toggleCustomGasModal();
			return;
		}
		this.setState({ gasEstimationReady: false });
		const { prepareTransaction, transactionState } = this.props;
		let transaction = transactionState.transaction;
		transaction = { ...transaction, gas: customGas, gasPrice: customGasPrice };

		prepareTransaction(transaction);
		setTimeout(() => {
			this.parseTransactionData();
			this.setState({
				customGas: undefined,
				customGasPrice: undefined,
				gasEstimationReady: true,
				currentCustomGasSelected: customGasSelected,
				errorMessage: undefined
			});
		}, 100);
		this.toggleCustomGasModal();
	};

	toggleCustomGasModal = () => {
		const { customGasModalVisible } = this.state;
		this.setState({ customGasModalVisible: !customGasModalVisible });
		InteractionManager.runAfterInteractions(() => {
			Analytics.trackEvent(ANALYTICS_EVENT_OPTS.SEND_FLOW_ADJUSTS_TRANSACTION_FEE);
		});
	};

	toggleHexDataModal = () => {
		const { hexDataModalVisible } = this.state;
		this.setState({ hexDataModalVisible: !hexDataModalVisible });
	};

	renderCustomGasModal = () => {
		const { customGasModalVisible, currentCustomGasSelected } = this.state;
		const { gas, gasPrice } = this.props.transactionState.transaction;
		return (
			<Modal
				isVisible={customGasModalVisible}
				animationIn="slideInUp"
				animationOut="slideOutDown"
				style={styles.bottomModal}
				backdropOpacity={0.7}
				animationInTiming={600}
				animationOutTiming={600}
				onBackdropPress={this.toggleCustomGasModal}
				onBackButtonPress={this.toggleCustomGasModal}
				onSwipeComplete={this.toggleCustomGasModal}
				swipeDirection={'down'}
				propagateSwipe
			>
				<View style={styles.customGasWrapper}>
					<View style={styles.customGasModalTitle}>
						<Text style={styles.customGasModalTitleText}>{strings('transaction.transaction_fee')}</Text>
					</View>
					<CustomGas
						selected={currentCustomGasSelected}
						handleGasFeeSelection={this.handleGasFeeSelection}
						gas={gas}
						gasPrice={gasPrice}
					/>
				</View>
			</Modal>
		);
	};

	renderHexDataModal = () => {
		const { hexDataModalVisible } = this.state;
		const { data } = this.props.transactionState.transaction;
		return (
			<Modal
				isVisible={hexDataModalVisible}
				onBackdropPress={this.toggleHexDataModal}
				onBackButtonPress={this.toggleHexDataModal}
				onSwipeComplete={this.toggleHexDataModal}
				swipeDirection={'down'}
				propagateSwipe
			>
				<View style={styles.hexDataWrapper}>
					<TouchableOpacity style={styles.hexDataClose} onPress={this.toggleHexDataModal}>
						<IonicIcon name={'ios-close'} size={28} color={colors.black} />
					</TouchableOpacity>
					<View style={styles.qrCode}>
						<Text style={styles.addressTitle}>{strings('transaction.hex_data')}</Text>
						<Text style={styles.hexDataText}>{data || strings('unit.empty_data')}</Text>
					</View>
				</View>
			</Modal>
		);
	};

	validateGas = () => {
		const { accounts } = this.props;
		const { gas, gasPrice, value, from } = this.props.transactionState.transaction;
		let errorMessage;
		const totalGas = gas.mul(gasPrice);
		const valueBN = hexToBN(value);
		const balanceBN = hexToBN(accounts[from].balance);
		if (valueBN.add(totalGas).gt(balanceBN)) {
			errorMessage = strings('transaction.insufficient');
			this.setState({ errorMessage });
		}
		return errorMessage;
	};

	prepareTransactionToSend = () => {
		const {
			transactionState: { transaction }
		} = this.props;
		transaction.gas = BNToHex(transaction.gas);
		transaction.gasPrice = BNToHex(transaction.gasPrice);
		return transaction;
	};

	/**
	 * Removes collectible in case an ERC721 asset is being sent, when not in mainnet
	 */
	checkRemoveCollectible = () => {
		const {
			transactionState: { selectedAsset, assetType },
			network
		} = this.props;
		if (assetType === 'ERC721' && network !== 1) {
			const { AssetsController } = Engine.context;
			AssetsController.removeCollectible(selectedAsset.address, selectedAsset.tokenId);
		}
	};

	onNext = async () => {
		const { TransactionController } = Engine.context;
		const {
			transactionState: { assetType },
			navigation,
			providerType
		} = this.props;
		this.setState({ transactionConfirmed: true });
		if (this.validateGas()) {
			this.setState({ transactionConfirmed: false });
			return;
		}
		try {
			const transaction = this.prepareTransactionToSend();
			const { result, transactionMeta } = await TransactionController.addTransaction(
				transaction,
				TransactionTypes.MMM
			);

			await TransactionController.approveTransaction(transactionMeta.id);
			await new Promise(resolve => resolve(result));

			if (transactionMeta.error) {
				throw transactionMeta.error;
			}

			InteractionManager.runAfterInteractions(() => {
				console.log('transactionnnn', { ...transactionMeta, assetType: transactionMeta.transaction.assetType });
				TransactionsNotificationManager.watchSubmittedTransaction({
					...transactionMeta,
					assetType
				});
				this.checkRemoveCollectible();
				Analytics.trackEventWithParameters(ANALYTICS_EVENT_OPTS.SEND_FLOW_CONFIRM_SEND, {
					network: providerType
				});
				navigation && navigation.dismiss();
			});
		} catch (error) {
			Alert.alert(strings('transactions.transaction_error'), error && error.message, [
				{ text: strings('navigation.ok') }
			]);
		}
		this.setState({ transactionConfirmed: false });
	};

	render = () => {
		const {
			transaction: { from },
			transactionToName,
			transactionFromName,
			selectedAsset
		} = this.props.transactionState;
		const { showHexData, primaryCurrency } = this.props;
		const {
			gasEstimationReady,
			fromAccountBalance,
			transactionValue,
			transactionValueFiat,
			transactionFeeFiat,
			transactionFee,
			transactionTo,
			transactionTotalAmount,
			transactionTotalAmountFiat,
			errorMessage,
			transactionConfirmed
		} = this.state;
		return (
			<SafeAreaView style={styles.wrapper} testID={'txn-confirm-screen'}>
				<View style={styles.inputWrapper}>
					<AddressFrom
						onPressIcon={this.toggleFromAccountModal}
						fromAccountAddress={from}
						fromAccountName={transactionFromName}
						fromAccountBalance={fromAccountBalance}
					/>
					<AddressTo
						addressToReady
						toSelectedAddress={transactionTo}
						toAddressName={transactionToName}
						onToSelectedAddressChange={this.onToSelectedAddressChange}
					/>
				</View>

				<ScrollView style={baseStyles.flexGrow}>
					{!selectedAsset.tokenId ? (
						<View style={styles.amountWrapper}>
							<Text style={styles.textAmountLabel}>{strings('transaction.amount')}</Text>
							<Text style={styles.textAmount} testID={'confirm-txn-amount'}>
								{transactionValue}
							</Text>
							<Text style={styles.textAmountLabel}>{transactionValueFiat}</Text>
						</View>
					) : (
						<View style={styles.amountWrapper}>
							<Text style={styles.textAmountLabel}>{strings('transaction.asset')}</Text>
							<View style={styles.collectibleImageWrapper}>
								<CollectibleImage
									iconStyle={styles.collectibleImage}
									containerStyle={styles.collectibleImage}
									collectible={selectedAsset}
								/>
							</View>
							<View>
								<Text style={styles.collectibleName}>{selectedAsset.name}</Text>
								<Text style={styles.collectibleTokenId}>{`#${selectedAsset.tokenId}`}</Text>
							</View>
						</View>
					)}
					<TransactionReviewFeeCard
						totalGasFiat={transactionFeeFiat}
						totalGasEth={transactionFee}
						totalFiat={transactionTotalAmountFiat}
						fiat={transactionValueFiat}
						totalValue={transactionTotalAmount}
						transactionValue={transactionValue}
						primaryCurrency={primaryCurrency}
						gasEstimationReady={gasEstimationReady}
						toggleCustomGasModal={this.toggleCustomGasModal}
					/>
					{errorMessage && (
						<View style={styles.errorMessageWrapper}>
							<ErrorMessage errorMessage={errorMessage} />
						</View>
					)}
					<View style={styles.actionsWrapper}>
						{showHexData && (
							<TouchableOpacity style={styles.actionTouchable} onPress={this.toggleHexDataModal}>
								<Text style={styles.actionText}>{strings('transaction.hex_data')}</Text>
							</TouchableOpacity>
						)}
					</View>
				</ScrollView>
				<View style={styles.buttonNextWrapper}>
					<StyledButton
						type={'confirm'}
						disabled={!gasEstimationReady}
						containerStyle={styles.buttonNext}
						onPress={this.onNext}
						testID={'txn-confirm-send-button'}
					>
						{transactionConfirmed ? <ActivityIndicator size="small" color="white" /> : 'Send'}
					</StyledButton>
				</View>
				{this.renderCustomGasModal()}
				{this.renderHexDataModal()}
			</SafeAreaView>
		);
	};
}

const mapStateToProps = state => ({
	accounts: state.engine.backgroundState.AccountTrackerController.accounts,
	contractBalances: state.engine.backgroundState.TokenBalancesController.contractBalances,
	contractExchangeRates: state.engine.backgroundState.TokenRatesController.contractExchangeRates,
	currentCurrency: state.engine.backgroundState.CurrencyRateController.currentCurrency,
	conversionRate: state.engine.backgroundState.CurrencyRateController.conversionRate,
	network: state.engine.backgroundState.NetworkController.network,
	showHexData: state.settings.showHexData,
	providerType: state.engine.backgroundState.NetworkController.provider.type,
	ticker: state.engine.backgroundState.NetworkController.provider.ticker,
	transactionState: state.newTransaction,
	primaryCurrency: state.settings.primaryCurrency
});

const mapDispatchToProps = dispatch => ({
	prepareTransaction: transaction => dispatch(prepareTransaction(transaction))
});

export default connect(
	mapStateToProps,
	mapDispatchToProps
)(Confirm);
