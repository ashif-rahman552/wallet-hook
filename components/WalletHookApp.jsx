import React, { useState, useEffect, useCallback } from "react";
import { auth, db } from "../lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc, collection, getDocs, query, where, orderBy } from "firebase/firestore";
import {
  TRANSACTION_CATEGORIES,
  newEntryId,
  todayDateString,
  addDaysToDateString,
  loadDailyLog,
  saveDailyLog,
  loadMonthLogs,
  aggregateMonth,
  generateInsights,
  prevYearMonth,
} from "../lib/dailyLogService";
import {
  calculatePlanningDataWithMarket,
  calculatePlanningData,
  GOAL_TYPES,
  PRIORITY_LEVELS,
} from "../lib/planningService";
import {
  generatePersonalizedAdvice,
  getMotivationalMessage,
  calculateFinancialHealthScore,
  getHealthScoreDisplay,
  ADVICE_CATEGORIES,
} from "../lib/adviceService";
import {
  createGoal,
  addSavingsToGoal,
  getGoalStatistics,
  getCompletedGoals,
  deleteGoal,
} from "../lib/savingsService";

/** SHA-256 hex (browser Web Crypto) */
async function sha256Hex(message) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(message)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safetyPinRef(uid) {
  return doc(db, "users", uid, "private", "safetyPin");
}

/** Latest budget result for this user (used by Advice & future features) */
function budgetLatestRef(uid) {
  return doc(db, "users", uid, "private", "budgetLatest");
}

/** Planning goals collection for this user */
function planningGoalsRef(uid) {
  return collection(db, "users", uid, "planningGoals");
}

/** Specific planning goal document */
function planningGoalRef(uid, goalId) {
  return doc(db, "users", uid, "planningGoals", goalId);
}

/** Savings goals collection for this user */
function savingsGoalsRef(uid) {
  return collection(db, "users", uid, "savingsGoals");
}

/** Specific savings goal document */
function savingsGoalRef(uid, goalId) {
  return doc(db, "users", uid, "savingsGoals", goalId);
}

/** Savings transactions collection for this user */
function savingsTransactionsRef(uid) {
  return collection(db, "users", uid, "savingsTransactions");
}

/** Specific savings transaction document */
function savingsTransactionRef(uid, transactionId) {
  return doc(db, "users", uid, "savingsTransactions", transactionId);
}

/** Goal completion logs collection */
function goalCompletionLogsRef(uid) {
  return collection(db, "users", uid, "goalCompletionLogs");
}

/** Specific goal completion log document */
function goalCompletionLogRef(uid, logId) {
  return doc(db, "users", uid, "goalCompletionLogs", logId);
}

/** Days per month for converting daily → monthly */
const BUDGET_DAYS_PER_MONTH = 30;

function parseMoney(v) {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function formatMoney(n) {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function WalletHookApp() {
  const [screen, setScreen] = useState("login");
  const [user, setUser] = useState(null);
  const [hasSafetyPin, setHasSafetyPin] = useState(false);

  // Advice state
  const [advice, setAdvice] = useState("");
  const [loadingAdvice, setLoadingAdvice] = useState(false);

  // Auth state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPassword2, setSignupPassword2] = useState("");

  const [forgotEmail, setForgotEmail] = useState("");

  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // PIN: unlock Budgeting / Planning / Savings
  const [pinTarget, setPinTarget] = useState(null); // 'budgeting' | 'planning' | 'savings'
  const [pinVerifyInput, setPinVerifyInput] = useState("");
  const [pinManageCurrent, setPinManageCurrent] = useState("");
  const [pinManageNew, setPinManageNew] = useState("");
  const [pinManageConfirm, setPinManageConfirm] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [homePinHint, setHomePinHint] = useState("");

  // Budgeting (after PIN unlock)
  const [budgetMonthlyIncome, setBudgetMonthlyIncome] = useState("");
  const [budgetAvgDailyFood, setBudgetAvgDailyFood] = useState("");
  const [budgetMonthlyRent, setBudgetMonthlyRent] = useState("");
  const [budgetDailyCommute, setBudgetDailyCommute] = useState("");
  const [budgetDailyFood, setBudgetDailyFood] = useState("");
  const [budgetAccommodations, setBudgetAccommodations] = useState("");
  const [budgetOther, setBudgetOther] = useState("");
  const [budgetError, setBudgetError] = useState("");
  const [budgetResult, setBudgetResult] = useState(null);
  /** Last budget snapshot from Firestore (for Advice & future features) */
  const [lastSavedBudget, setLastSavedBudget] = useState(null);
  const [budgetSnapshotLoading, setBudgetSnapshotLoading] = useState(false);
  const [budgetSaveStatus, setBudgetSaveStatus] = useState("");

  // Daily logs (Budgeting area)
  const [dailyLogDate, setDailyLogDate] = useState(() => todayDateString());
  const [dailyLogEntries, setDailyLogEntries] = useState([]);
  const [dailyLogLoading, setDailyLogLoading] = useState(false);
  const [dailyLogSaveMsg, setDailyLogSaveMsg] = useState("");
  const [newTxnAmount, setNewTxnAmount] = useState("");
  const [newTxnCategory, setNewTxnCategory] = useState("Food");
  const [newTxnNote, setNewTxnNote] = useState("");
  const [newTxnType, setNewTxnType] = useState("expense");
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [monthListYM, setMonthListYM] = useState(() => {
    const t = todayDateString();
    return t.slice(0, 7);
  });
  const [monthListDays, setMonthListDays] = useState([]);
  const [monthListLoading, setMonthListLoading] = useState(false);
  const [insightMonth, setInsightMonth] = useState(() =>
    todayDateString().slice(0, 7)
  );
  const [insightAgg, setInsightAgg] = useState(null);
  const [insightLines, setInsightLines] = useState([]);
  const [insightLoading, setInsightLoading] = useState(false);

  // Planning state
  const [planningGoalName, setPlanningGoalName] = useState("");
  const [planningGoalType, setPlanningGoalType] = useState("car");
  const [planningTargetAmount, setPlanningTargetAmount] = useState("");
  const [planningCurrentSavings, setPlanningCurrentSavings] = useState("");
  const [planningMonthlyIncome, setPlanningMonthlyIncome] = useState("");
  const [planningFixedExpenses, setPlanningFixedExpenses] = useState("");
  const [planningVariableExpenses, setPlanningVariableExpenses] = useState("");
  const [planningTimeframe, setPlanningTimeframe] = useState("");
  const [planningPriority, setPlanningPriority] = useState("medium");
  const [planningError, setPlanningError] = useState("");
  const [planningResult, setPlanningResult] = useState(null);
  const [planningLoading, setPlanningLoading] = useState(false);

  // Savings state
  const [savingsGoals, setSavingsGoals] = useState([]);
  const [savingsTransactions, setSavingsTransactions] = useState([]);
  const [savingsLoading, setSavingsLoading] = useState(false);
  const [savingsError, setSavingsError] = useState("");
  
  // New goal form state
  const [newGoalName, setNewGoalName] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("");
  const [newGoalCurrent, setNewGoalCurrent] = useState("");
  const [newGoalDeadline, setNewGoalDeadline] = useState("");
  
  // Add savings form state
  const [selectedGoalId, setSelectedGoalId] = useState("");
  const [addSavingsAmount, setAddSavingsAmount] = useState("");
  const [addSavingsDate, setAddSavingsDate] = useState(new Date().toISOString().split('T')[0]);
  
  // Savings insights state
  const [savingsInsights, setSavingsInsights] = useState(null);
  const [monthlySavingsSuggestion, setMonthlySavingsSuggestion] = useState(null);
  
  // Goals history and statistics
  const [showGoalsHistory, setShowGoalsHistory] = useState(false);
  const [goalsStatistics, setGoalsStatistics] = useState(null);
  const [completedGoals, setCompletedGoals] = useState([]);
  
  // Advice state
  const [personalizedAdvices, setPersonalizedAdvices] = useState([]);
  const [financialHealthScore, setFinancialHealthScore] = useState(50);
  const [motivationalMessage, setMotivationalMessage] = useState(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [selectedAdviceCategory, setSelectedAdviceCategory] = useState(ADVICE_CATEGORIES.BUDGET);

  const resetBudgetForm = () => {
    setBudgetMonthlyIncome("");
    setBudgetAvgDailyFood("");
    setBudgetMonthlyRent("");
    setBudgetDailyCommute("");
    setBudgetDailyFood("");
    setBudgetAccommodations("");
    setBudgetOther("");
    setBudgetError("");
    setBudgetResult(null);
  };

  const show = (name) => {
    setAuthError("");
    setPinError("");
    setScreen(name);
  };

  const loadSafetyPinFlag = useCallback(async (uid) => {
    try {
      const snap = await getDoc(safetyPinRef(uid));
      setHasSafetyPin(snap.exists());
    } catch (e) {
      console.error(e);
      setHasSafetyPin(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await loadSafetyPinFlag(u.uid);
      } else {
        setHasSafetyPin(false);
        setScreen("login");
      }
    });
    return () => unsub();
  }, [loadSafetyPinFlag]);

  const fetchAdvice = async () => {
    try {
      setLoadingAdvice(true);
      setAdvice("");

      const res = await fetch("https://api.adviceslip.com/advice", {
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Status ${res.status}`);
      }

      const data = await res.json();
      const text = data?.slip?.advice || "No advice received. Try again.";
      setAdvice(text);
    } catch (err) {
      console.error("Advice fetch failed:", err);
      setAdvice("Could not load advice. Please try again.");
    } finally {
      setLoadingAdvice(false);
    }
  };

  useEffect(() => {
    if (screen === "advice") {
      fetchAdvice();
      generatePersonalAdvice();
    }
  }, [screen]);

  /** Load savings goals when opening savings screen */
  useEffect(() => {
    if (screen === "savings") {
      const u = auth.currentUser;
      if (u) {
        loadSavingsGoals(u.uid);
        generateSavingsSuggestions();
      }
    }
  }, [screen]);

  /** Load saved budget when opening Advice (for personalized tips) */
  useEffect(() => {
    if (screen !== "advice") return;
    const u = auth.currentUser;
    if (!u) {
      setLastSavedBudget(null);
      setBudgetSnapshotLoading(false);
      return;
    }
    let cancelled = false;
    setBudgetSnapshotLoading(true);
    (async () => {
      try {
        const snap = await getDoc(budgetLatestRef(u.uid));
        if (!cancelled && snap.exists()) {
          setLastSavedBudget(snap.data());
        } else if (!cancelled) {
          setLastSavedBudget(null);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setLastSavedBudget(null);
      } finally {
        if (!cancelled) setBudgetSnapshotLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [screen]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      show("home");
    } catch (err) {
      setAuthError(err.message || "Login failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    setAuthError("");
    if (signupPassword !== signupPassword2) {
      setAuthError("Passwords do not match");
      return;
    }
    setAuthLoading(true);
    try {
      await createUserWithEmailAndPassword(
        auth,
        signupEmail,
        signupPassword
      );
      show("home");
    } catch (err) {
      setAuthError(err.message || "Signup failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setAuthError("");
    if (!forgotEmail) {
      setAuthError("Enter your email first");
      return;
    }
    setAuthLoading(true);
    try {
      console.log("Sending password reset to:", forgotEmail);
      await sendPasswordResetEmail(auth, forgotEmail);
      console.log("Password reset email sent successfully");
      show("verify");
    } catch (err) {
      console.error("Password reset error:", err);
      setAuthError(err.message || "Could not send reset email");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error(e);
    }
    show("login");
  };

  /** Open Budgeting / Planning / Savings only after PIN */
  const openProtected = (target) => {
    setHomePinHint("");
    if (!hasSafetyPin) {
      setHomePinHint(
        "Set a 4-digit Safety PIN from the menu before using this."
      );
      return;
    }
    setPinTarget(target);
    setPinVerifyInput("");
    setPinError("");
    show("pin_verify");
  };

  const verifyPinAndEnter = async (e) => {
    e.preventDefault();
    setPinError("");
    const u = auth.currentUser;
    if (!u) {
      setPinError("Not signed in.");
      return;
    }
    if (!/^\d{4}$/.test(pinVerifyInput)) {
      setPinError("Enter exactly 4 digits.");
      return;
    }
    setPinBusy(true);
    try {
      const snap = await getDoc(safetyPinRef(u.uid));
      if (!snap.exists()) {
        setPinError("No PIN saved. Set one from the menu.");
        return;
      }
      const { salt, hash } = snap.data();
      const candidate = await sha256Hex(`${salt}:${pinVerifyInput}`);
      if (candidate !== hash) {
        setPinError("Wrong PIN. Try again.");
        return;
      }
      const dest = pinTarget;
      setPinTarget(null);
      setPinVerifyInput("");
      if (dest === "budgeting") {
        resetBudgetForm();
        show("budgeting_hub");
        return;
      }
      show(dest || "home");
    } catch (err) {
      console.error(err);
      setPinError("Could not verify PIN. Check Firestore rules & network.");
    } finally {
      setPinBusy(false);
    }
  };

  const saveNewPin = async (e) => {
    e.preventDefault();
    setPinError("");
    const u = auth.currentUser;
    if (!u) {
      setPinError("Not signed in.");
      return;
    }
    if (!/^\d{4}$/.test(pinManageNew)) {
      setPinError("New PIN must be exactly 4 digits.");
      return;
    }
    if (pinManageNew !== pinManageConfirm) {
      setPinError("New PIN and confirmation do not match.");
      return;
    }
    setPinBusy(true);
    try {
      const snap = await getDoc(safetyPinRef(u.uid));

      if (snap.exists()) {
        if (!/^\d{4}$/.test(pinManageCurrent)) {
          setPinError("Enter your current 4-digit PIN.");
          setPinBusy(false);
          return;
        }
        const { salt: oldSalt, hash: oldHash } = snap.data();
        const check = await sha256Hex(`${oldSalt}:${pinManageCurrent}`);
        if (check !== oldHash) {
          setPinError("Current PIN is wrong.");
          setPinBusy(false);
          return;
        }
      }

      const salt = randomSalt();
      const hash = await sha256Hex(`${salt}:${pinManageNew}`);
      await setDoc(safetyPinRef(u.uid), {
        salt,
        hash,
        updatedAt: new Date().toISOString(),
      });
      setHasSafetyPin(true);
      setPinManageCurrent("");
      setPinManageNew("");
      setPinManageConfirm("");
      setHomePinHint("Safety PIN saved.");
      show("home");
    } catch (err) {
      console.error(err);
      setPinError("Could not save PIN. Enable Firestore & deploy rules.");
    } finally {
      setPinBusy(false);
    }
  };

  /**
   * Daily amounts → monthly (×30). Monthly amounts used as-is.
   * Balance % of income determines: ≥30% highly positive, 10–<30% moderate, <10% risky.
   * Persists to Firestore `users/{uid}/private/budgetLatest` for Advice & future features.
   */
  const handleBudgetSubmit = async (e) => {
    e.preventDefault();
    setBudgetError("");
    setBudgetSaveStatus("");
    const income = parseMoney(budgetMonthlyIncome);
    if (income <= 0) {
      setBudgetError("Enter a monthly income greater than zero.");
      return;
    }

    const avgDailyFood = parseMoney(budgetAvgDailyFood);
    const rent = parseMoney(budgetMonthlyRent);
    const dailyCommute = parseMoney(budgetDailyCommute);
    const dailyFood = parseMoney(budgetDailyFood);
    const accommodations = parseMoney(budgetAccommodations);
    const other = parseMoney(budgetOther);

    const monthlyFromAvgDailyFood = avgDailyFood * BUDGET_DAYS_PER_MONTH;
    const monthlyFromCommute = dailyCommute * BUDGET_DAYS_PER_MONTH;
    const monthlyFromDailyFood = dailyFood * BUDGET_DAYS_PER_MONTH;

    const totalExpenses =
      monthlyFromAvgDailyFood +
      rent +
      monthlyFromCommute +
      monthlyFromDailyFood +
      accommodations +
      other;

    const balance = income - totalExpenses;
    const pctOfIncome = income > 0 ? (balance / income) * 100 : 0;

    let balanceLabel;
    if (balance < 0) {
      balanceLabel = "Risky balance";
    } else if (pctOfIncome >= 30) {
      balanceLabel = "Highly positive balance";
    } else if (pctOfIncome >= 10) {
      balanceLabel = "Moderate balance";
    } else {
      balanceLabel = "Risky balance";
    }

    const result = {
      income,
      totalExpenses,
      balance,
      pctOfIncome,
      balanceLabel,
      breakdown: {
        monthlyFromAvgDailyFood,
        rent,
        monthlyFromCommute,
        monthlyFromDailyFood,
        accommodations,
        other,
      },
    };

    setBudgetResult(result);

    const u = auth.currentUser;
    if (u) {
      try {
        await setDoc(budgetLatestRef(u.uid), {
          ...result,
          inputs: {
            monthlyIncome: income,
            avgDailyFood,
            monthlyRent: rent,
            dailyCommute,
            dailyFood,
            accommodations,
            other,
          },
          updatedAt: new Date().toISOString(),
        });
        setLastSavedBudget({
          ...result,
          inputs: {
            monthlyIncome: income,
            avgDailyFood,
            monthlyRent: rent,
            dailyCommute,
            dailyFood,
            accommodations,
            other,
          },
          updatedAt: new Date().toISOString(),
        });
        setBudgetSaveStatus("Saved to your account.");
      } catch (err) {
        console.error(err);
        setBudgetSaveStatus("Could not save online—check Firestore rules.");
      }
    }
  };

  const handlePlanningSubmit = async (e) => {
    e.preventDefault();
    setPlanningError("");
    setPlanningLoading(true);

    try {
      const planningData = {
        goal_name: planningGoalName,
        goal_type: planningGoalType,
        target_amount: parseFloat(planningTargetAmount) || 0,
        current_savings: parseFloat(planningCurrentSavings) || 0,
        monthly_income: parseFloat(planningMonthlyIncome) || 0,
        fixed_expenses: parseFloat(planningFixedExpenses) || 0,
        variable_expenses: parseFloat(planningVariableExpenses) || 0,
        timeframe_months: planningTimeframe ? parseInt(planningTimeframe) : null,
        priority: planningPriority,
      };

      const result = await calculatePlanningDataWithMarket(planningData);
      setPlanningResult(result);

      // Save to Firestore
      const u = auth.currentUser;
      if (u) {
        try {
          const goalId = newEntryId();
          await setDoc(planningGoalRef(u.uid, goalId), {
            ...result,
            goalId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error("Could not save planning goal:", err);
        }
      }
    } catch (error) {
      setPlanningError(error.message || "Calculation failed. Please check your inputs.");
    } finally {
      setPlanningLoading(false);
    }
  };

  const resetPlanningForm = () => {
    setPlanningGoalName("");
    setPlanningGoalType("car");
    setPlanningTargetAmount("");
    setPlanningCurrentSavings("");
    setPlanningMonthlyIncome("");
    setPlanningFixedExpenses("");
    setPlanningVariableExpenses("");
    setPlanningTimeframe("");
    setPlanningPriority("medium");
    setPlanningError("");
    setPlanningResult(null);
  };

  // Savings handlers
  const handleCreateGoal = async (e) => {
    e.preventDefault();
    setSavingsError("");
    
    try {
      const goalData = {
        name: newGoalName,
        target_amount: parseFloat(newGoalTarget) || 0,
        current_saved: parseFloat(newGoalCurrent) || 0,
        deadline: newGoalDeadline || null,
      };

      const newGoal = createGoal(goalData);
      const u = auth.currentUser;
      
      if (u) {
        await setDoc(savingsGoalRef(u.uid, newGoal.id), newGoal);
        await loadSavingsGoals(u.uid);
      }
      
      // Reset form
      setNewGoalName("");
      setNewGoalTarget("");
      setNewGoalCurrent("");
      setNewGoalDeadline("");
    } catch (error) {
      setSavingsError(error.message || "Failed to create goal");
    }
  };

  const handleAddSavings = async (e) => {
    e.preventDefault();
    setSavingsError("");
    
    if (!selectedGoalId || !addSavingsAmount) {
      setSavingsError("Please select a goal and enter amount");
      return;
    }
    
    try {
      const goal = savingsGoals.find(g => g.id === selectedGoalId);
      if (!goal) {
        setSavingsError("Goal not found");
        return;
      }

      const result = addSavingsToGoal(goal, parseFloat(addSavingsAmount), addSavingsDate);
      const u = auth.currentUser;
      
      if (u) {
        // Save transaction
        await setDoc(savingsTransactionRef(u.uid, result.transaction.id), result.transaction);
        
        // Update goal
        await setDoc(savingsGoalRef(u.uid, goal.id), result.updated_goal);
        
        // Save completion log if goal was just completed
        if (result.completion_log) {
          await setDoc(goalCompletionLogRef(u.uid, result.completion_log.id), result.completion_log);
        }
        
        await loadSavingsGoals(u.uid);
        
        // Show completion notification
        if (result.was_just_completed) {
          alert(`🎉 Congratulations! You've completed your goal: ${goal.name}`);
        }
      }
      
      // Reset form
      setAddSavingsAmount("");
      setSelectedGoalId("");
    } catch (error) {
      setSavingsError(error.message || "Failed to add savings");
    }
  };

  const handleDeleteGoal = async (goalId) => {
    const goal = savingsGoals.find(g => g.id === goalId);
    if (!goal) return;
    
    if (!confirm(`Are you sure you want to delete the completed goal "${goal.name}"?`)) {
      return;
    }
    
    try {
      const result = deleteGoal(goal, savingsTransactions);
      const u = auth.currentUser;
      
      if (u) {
        // Mark goal as deleted
        await setDoc(savingsGoalRef(u.uid, goalId), result.deleted_goal);
        
        // Archive transactions
        for (const transaction of result.archived_transactions) {
          await setDoc(savingsTransactionRef(u.uid, transaction.id), transaction);
        }
        
        await loadSavingsGoals(u.uid);
      }
    } catch (error) {
      setSavingsError(error.message || "Failed to delete goal");
    }
  };

  const toggleGoalsHistory = () => {
    if (!showGoalsHistory) {
      // Calculate statistics when opening history
      const stats = getGoalStatistics(savingsGoals, savingsTransactions);
      const completed = getCompletedGoals(savingsGoals, savingsTransactions);
      setGoalsStatistics(stats);
      setCompletedGoals(completed);
    }
    setShowGoalsHistory(!showGoalsHistory);
  };

  // Advice handlers
  const generatePersonalAdvice = async () => {
    setAdviceLoading(true);
    try {
      // Collect data from all features
      const userData = {
        budgetData: lastSavedBudget ? {
          balance: lastSavedBudget.balance,
          pctOfIncome: lastSavedBudget.pctOfIncome
        } : null,
        savingsGoals: savingsGoals,
        planningGoals: planningResult ? [planningResult.goal_data] : [],
        transactions: savingsTransactions
      };
      
      const advices = generatePersonalizedAdvice(userData);
      setPersonalizedAdvices(advices);
      
      // Calculate financial health score
      const healthScore = calculateFinancialHealthScore(userData);
      setFinancialHealthScore(healthScore);
      
      // Get motivational message
      const motivational = getMotivationalMessage();
      setMotivationalMessage(motivational);
      
    } catch (error) {
      console.error("Failed to generate advice:", error);
    } finally {
      setAdviceLoading(false);
    }
  };

  const refreshAdvice = () => {
    generatePersonalAdvice();
  };

  const filterAdviceByCategory = (category) => {
    setSelectedAdviceCategory(category);
  };

  const loadSavingsGoals = async (uid) => {
    setSavingsLoading(true);
    try {
      const goalsQuery = query(savingsGoalsRef(uid), orderBy("created_at", "desc"));
      const goalsSnapshot = await getDocs(goalsQuery);
      const goals = goalsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSavingsGoals(goals);
      
      // Load transactions for progress calculation
      const transactionsQuery = query(savingsTransactionsRef(uid), orderBy("date", "desc"));
      const transactionsSnapshot = await getDocs(transactionsQuery);
      const transactions = transactionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSavingsTransactions(transactions);
      
    } catch (error) {
      console.error("Failed to load savings goals:", error);
      setSavingsError("Failed to load goals");
    } finally {
      setSavingsLoading(false);
    }
  };

  const generateSavingsSuggestions = () => {
    const u = auth.currentUser;
    if (!u || !lastSavedBudget) return;
    
    const suggestion = suggestMonthlySavings(
      lastSavedBudget.inputs.monthlyIncome,
      lastSavedBudget.inputs.monthlyRent + lastSavedBudget.inputs.monthlyFromAvgDailyFood + 
      lastSavedBudget.inputs.dailyCommute * 30 + lastSavedBudget.inputs.dailyFood * 30 +
      lastSavedBudget.inputs.accommodations + lastSavedBudget.inputs.other,
      savingsGoals
    );
    
    setMonthlySavingsSuggestion(suggestion);
  };

  const calculateGoalInsights = (goal) => {
    if (!lastSavedBudget) return null;
    
    const insights = generateSavingsInsights(
      goal,
      lastSavedBudget.inputs.monthlyIncome,
      lastSavedBudget.inputs.monthlyRent + lastSavedBudget.inputs.monthlyFromAvgDailyFood + 
      lastSavedBudget.inputs.dailyCommute * 30 + lastSavedBudget.inputs.dailyFood * 30 +
      lastSavedBudget.inputs.accommodations + lastSavedBudget.inputs.other
    );
    
    return insights;
  };

  /** Short tip for Advice screen based on saved budget (uses Firestore snapshot) */
  const budgetContextTip = (b) => {
    if (!b || typeof b.balance !== "number") return null;
    if (b.balance < 0) {
      return "Based on your saved budget: spending exceeds income—prioritize cutting the largest fixed costs.";
    }
    if (b.pctOfIncome >= 30) {
      return "Based on your saved budget: you have a strong cushion—consider extra debt paydown or long-term savings.";
    }
    if (b.pctOfIncome >= 10) {
      return "Based on your saved budget: cushion is moderate—small cuts to subscriptions or food can help.";
    }
    return "Based on your saved budget: cushion is tight—focus on building a small emergency buffer first.";
  };

  /** Load one day’s log when Daily Logs screen or date changes */
  useEffect(() => {
    if (screen !== "daily_logs") return;
    const u = auth.currentUser;
    if (!u) return;
    let cancelled = false;
    setDailyLogLoading(true);
    setDailyLogSaveMsg("");
    loadDailyLog(db, u.uid, dailyLogDate)
      .then((data) => {
        if (!cancelled) setDailyLogEntries(data.entries || []);
      })
      .catch(() => {
        if (!cancelled) setDailyLogEntries([]);
      })
      .finally(() => {
        if (!cancelled) setDailyLogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [screen, dailyLogDate]);

  /** Month list: which days have logs */
  useEffect(() => {
    if (screen !== "daily_logs_month") return;
    const u = auth.currentUser;
    if (!u) return;
    setMonthListLoading(true);
    loadMonthLogs(db, u.uid, monthListYM)
      .then((logs) => setMonthListDays(logs))
      .catch(() => setMonthListDays([]))
      .finally(() => setMonthListLoading(false));
  }, [screen, monthListYM]);

  /** Monthly insights when screen opens or month changes */
  useEffect(() => {
    if (screen !== "monthly_insights") return;
    const u = auth.currentUser;
    if (!u) return;
    let cancelled = false;
    setInsightLoading(true);
    (async () => {
      try {
        const curLogs = await loadMonthLogs(db, u.uid, insightMonth);
        const prevYm = prevYearMonth(insightMonth);
        const prevLogs = await loadMonthLogs(db, u.uid, prevYm);
        if (cancelled) return;
        const agg = aggregateMonth(curLogs);
        const pAgg = aggregateMonth(prevLogs);
        setInsightAgg(agg);
        setInsightLines(generateInsights(agg, pAgg));
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setInsightAgg(null);
          setInsightLines(["Could not load data."]);
        }
      } finally {
        if (!cancelled) setInsightLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [screen, insightMonth]);

  const saveDailyLogToCloud = async () => {
    const u = auth.currentUser;
    if (!u) return;
    setDailyLogSaveMsg("");
    try {
      await saveDailyLog(db, u.uid, dailyLogDate, dailyLogEntries);
      setDailyLogSaveMsg("Saved.");
    } catch (err) {
      console.error(err);
      setDailyLogSaveMsg("Save failed. Deploy Firestore rules.");
    }
  };

  /** Auto-save current day before switching dates (avoids losing edits) */
  const goToDailyLogDate = async (newDateStr) => {
    const u = auth.currentUser;
    if (u && dailyLogEntries.length > 0) {
      try {
        await saveDailyLog(db, u.uid, dailyLogDate, dailyLogEntries);
      } catch (e) {
        console.error(e);
      }
    }
    setDailyLogDate(newDateStr);
  };

  const submitNewTxn = (e) => {
    e.preventDefault();
    const amt = parseFloat(String(newTxnAmount).replace(/,/g, ""));
    if (!Number.isFinite(amt) || amt <= 0) return;
    const entry = {
      id: editingEntryId || newEntryId(),
      amount: amt,
      category: newTxnCategory,
      note: newTxnNote.trim(),
      type: newTxnType === "income" ? "income" : "expense",
    };
    if (editingEntryId) {
      setDailyLogEntries((rows) =>
        rows.map((x) => (x.id === editingEntryId ? entry : x))
      );
      setEditingEntryId(null);
    } else {
      setDailyLogEntries((rows) => [...rows, entry]);
    }
    setNewTxnAmount("");
    setNewTxnNote("");
  };

  const removeTxn = (id) => {
    setDailyLogEntries((rows) => rows.filter((x) => x.id !== id));
    if (editingEntryId === id) setEditingEntryId(null);
  };

  const startEditTxn = (tx) => {
    setEditingEntryId(tx.id);
    setNewTxnAmount(String(tx.amount));
    setNewTxnCategory(tx.category || "Other");
    setNewTxnNote(tx.note || "");
    setNewTxnType(tx.type === "income" ? "income" : "expense");
  };

  const cancelEditTxn = () => {
    setEditingEntryId(null);
    setNewTxnAmount("");
    setNewTxnNote("");
  };

  const PlaceholderScreen = ({ title, emoji }) => (
    <>
      <span className="wh-back" onClick={() => show("home")}>
        ←
      </span>
      <div className="wh-center" style={{ marginTop: 60 }}>
        <div className="wh-user">{emoji}</div>
        <div className="wh-title">{title}</div>
      </div>
      <div className="wh-card wh-verify-card">
        <p className="wh-small-text" style={{ textAlign: "center" }}>
          This section is ready for your next features (lists, charts, goals,
          etc.).
        </p>
        <button
          className="wh-submit"
          type="button"
          onClick={() => show("home")}
          style={{ marginTop: 20 }}
        >
          Back to menu
        </button>
      </div>
    </>
  );

  return (
    <div className="wh-root">
      <style>{`
        .wh-root {
          background:#111;
          min-height:100vh;
          display:flex;
          align-items:center;
          justify-content:center;
          font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
          color:#fff;
        }
        .wh-phone{width:390px;height:844px;background:#000;border-radius:40px;overflow:hidden;box-shadow:0 0 40px rgba(0,0,0,.7);padding:32px 24px;position:relative;}
        .wh-screen{display:none;width:100%;height:100%;position:relative;}
        .wh-screen--active{display:block;}
        .wh-top-bars{margin-bottom:40px;}
        .wh-bar{height:24px;background:#7d7d7d;border-radius:12px;margin-bottom:10px;width:80%;}
        .wh-bar:nth-child(2){width:70%;}
        .wh-bar:nth-child(3){width:60%;}
        .wh-center{display:flex;flex-direction:column;align-items:center;gap:16px;margin-bottom:24px;}
        .wh-logo{width:140px;height:140px;border-radius:32px;background:#fff;display:flex;align-items:center;justify-content:center;color:#000;font-weight:bold;font-size:18px;text-align:center;padding:8px;}
        .wh-user{width:56px;height:56px;border-radius:50%;border:4px solid #fff;display:flex;align-items:center;justify-content:center;font-size:26px;}
        .wh-title{font-family:"Impact","Anton",system-ui;letter-spacing:1px;font-size:24px;text-transform:uppercase;}
        .wh-card{margin:20px auto 0;padding:24px 20px 28px;background:#fff;border-radius:22px;color:#000;}
        .wh-field{margin-bottom:12px;}
        .wh-field input{width:100%;padding:10px 12px;border:none;outline:none;background:#7d7d7d;border-radius:4px;color:#fff;font-size:14px;letter-spacing:0.2em;text-align:center;}
        .wh-field input::placeholder{color:#f5f5f5;}
        .wh-links{display:flex;justify-content:space-between;font-size:12px;margin:10px 0 18px;color:#000;}
        .wh-link-btn{background:none;border:none;padding:0;color:inherit;cursor:pointer;font:inherit;}
        .wh-submit{display:block;margin:0 auto;padding:8px 32px;border-radius:999px;border:none;background:#000;color:#fff;font-size:15px;cursor:pointer;}
        .wh-bottom-row,.wh-bottom-bars{position:absolute;bottom:24px;left:24px;right:24px;display:flex;align-items:center;gap:16px;}
        .wh-bottom-logo{width:90px;height:90px;border-radius:24px;background:#fff;display:flex;align-items:center;justify-content:center;color:#000;font-weight:bold;font-size:10px;text-align:center;padding:6px;}
        .wh-back{position:absolute;top:10px;left:6px;font-size:28px;cursor:pointer;user-select:none;}
        .wh-small-text{margin-top:8px;font-size:12px;color:#000;}
        .wh-forgot-card,.wh-verify-card{margin-top:80px;}
        .wh-home-wrap{height:100%;background:#fff;border-radius:26px;padding:32px 20px 24px;position:relative;overflow:hidden;color:#000;}
        .wh-home-back{position:absolute;top:16px;left:12px;font-size:28px;cursor:pointer;}
        .wh-home-circle{position:absolute;width:360px;height:360px;border-radius:50%;background:#7d7d7d;top:80px;left:50%;transform:translateX(-50%);opacity:.8;}
        .wh-home-content{position:relative;margin-top:72px;text-align:center;z-index:1;max-height:calc(100% - 40px);overflow-y:auto;padding-bottom:8px;}
        .wh-home-title{font-family:"Impact","Anton",system-ui;margin-top:8px;margin-bottom:12px;font-size:22px;}
        .wh-home-sub{font-weight:600;margin-bottom:16px;letter-spacing:1px;}
        .wh-service{width:80%;margin:0 auto 10px;padding:12px;border-radius:16px;background:#7d7d7d;border:none;font-weight:600;color:#000;cursor:pointer;}
        .wh-advice-card{margin-top:40px;text-align:center;}
        .wh-advice-text{font-size:14px;margin-bottom:16px;color:#000;}
        .wh-error{color:red;margin-top:8px;font-size:12px;text-align:center;}
        .wh-hint{color:#333;margin:0 auto 10px;font-size:11px;max-width:85%;text-align:center;}
        .wh-budget-scroll{max-height:calc(100vh - 180px);overflow-y:auto;padding-right:4px;-webkit-overflow-scrolling:touch;}
        .wh-label{display:block;font-size:11px;color:#333;margin-bottom:4px;text-align:left;font-weight:600;}
        .wh-field input.wh-input-money{letter-spacing:normal;text-align:left;}
        .wh-budget-result{background:#f0f0f0;border-radius:12px;padding:14px;margin-top:12px;text-align:left;font-size:12px;}
        .wh-budget-result h4{margin:0 0 8px;font-size:14px;}
        .wh-balance-pill{display:inline-block;margin-top:8px;padding:8px 14px;border-radius:999px;font-weight:700;font-size:13px;}
        .wh-balance-highly{background:#1b5e20;color:#fff;}
        .wh-balance-moderate{background:#f9a825;color:#000;}
        .wh-balance-risky{background:#b71c1c;color:#fff;}
        .wh-dl-scroll{max-height:38vh;overflow-y:auto;margin-bottom:10px;}
        .wh-dl-row{display:flex;justify-content:space-between;align-items:flex-start;gap:8px;padding:8px;margin-bottom:6px;background:#eee;border-radius:8px;font-size:11px;}
        .wh-dl-row small{display:block;opacity:0.85;margin-top:2px;}
        .wh-pill-in{display:inline-block;padding:2px 8px;border-radius:6px;background:#1b5e20;color:#fff;font-size:10px;}
        .wh-pill-ex{display:inline-block;padding:2px 8px;border-radius:6px;background:#b71c1c;color:#fff;font-size:10px;}
        .wh-hub-btn{width:88%;margin:8px auto;padding:14px;border-radius:16px;border:none;background:#7d7d7d;font-weight:700;cursor:pointer;}
        .wh-form{background:#fff;border-radius:22px;padding:20px;margin-top:12px;}
        .wh-form-group{margin-bottom:12px;}
        .wh-input{width:100%;padding:10px;border:none;background:#7d7d7d;border-radius:4px;color:#fff;font-size:14px;box-sizing:border-box;}
        .wh-input::placeholder{color:#f5f5f5;}
        .wh-btn{display:block;margin:0 auto;padding:8px 32px;border-radius:999px;border:none;background:#000;color:#fff;font-size:15px;cursor:pointer;}
        .wh-btn--primary{background:#000;}
        .wh-btn--secondary{background:#7d7d7d;margin-top:8px;}
        .wh-planning-result{background:#fff;border-radius:22px;padding:20px;margin-top:12px;color:#000;}
        .wh-result-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}
        .wh-goal-summary{background:#f0f0f0;border-radius:12px;padding:14px;margin-bottom:16px;}
        .wh-goal-summary h4{margin:0 0 8px;font-size:16px;}
        .wh-goal-summary p{margin:4px 0;font-size:12px;}
        .wh-plans{margin-bottom:16px;}
        .wh-plan{background:#f8f8f8;border-radius:12px;padding:14px;margin-bottom:12px;border-left:4px solid #7d7d7d;}
        .wh-plan--comfortable{border-left-color:#4caf50;}
        .wh-plan--balanced{border-left-color:#ff9800;}
        .wh-plan--aggressive{border-left-color:#f44336;}
        .wh-plan-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
        .wh-plan-header h5{margin:0;font-size:14px;}
        .wh-difficulty{padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;}
        .wh-difficulty--easy{background:#4caf50;color:#fff;}
        .wh-difficulty--medium{background:#ff9800;color:#fff;}
        .wh-difficulty--hard{background:#f44336;color:#fff;}
        .wh-plan-details p{margin:4px 0;font-size:11px;}
        .wh-insights{background:#f0f0f0;border-radius:12px;padding:14px;}
        .wh-insights h4{margin:0 0 8px;font-size:14px;}
        .wh-insights-content p{margin:6px 0;font-size:12px;}
        .wh-insight{color:#1976d2;}
        .wh-suggestion{color:#388e3c;}
        .wh-market-analysis{background:#f8f8f8;border-radius:12px;padding:14px;margin-bottom:16px;}
        .wh-market-overview p{margin:4px 0;font-size:12px;}
        .wh-deviation-analysis{background:#e3f2fd;border-radius:8px;padding:10px;margin-top:8px;}
        .wh-deviation-suggestion{font-weight:600;color:#1565c0;margin-bottom:4px;}
        .wh-car-recommendations{margin-top:12px;}
        .wh-car-recommendations h5{margin:0 0 8px;font-size:13px;}
        .wh-car-card{background:#fff;border-radius:8px;padding:10px;margin-bottom:8px;border:1px solid #ddd;}
        .wh-car-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}
        .wh-car-header h6{margin:0;font-size:12px;font-weight:600;}
        .wh-car-price{font-weight:600;color:#2e7d32;}
        .wh-car-details p{margin:2px 0;font-size:10px;}
        .wh-price-higher{color:#d32f2f;}
        .wh-price-lower{color:#2e7d32;}
        .wh-savings-suggestion{background:#e8f5e8;border-radius:12px;padding:14px;margin-bottom:16px;}
        .wh-suggestion-message{font-style:italic;color:#1b5e20;margin:8px 0;}
        .wh-suggestion-details p{margin:4px 0;font-size:11px;}
        .wh-feasibility{padding:2px 8px;border-radius:6px;font-size:10px;font-weight:600;}
        .wh-feasibility--feasible{background:#4caf50;color:#fff;}
        .wh-feasibility--challenging{background:#ff9800;color:#fff;}
        .wh-feasibility--not_feasible{background:#f44336;color:#fff;}
        .wh-create-goal{background:#fff;border-radius:22px;padding:20px;margin-bottom:16px;}
        .wh-add-savings{background:#fff;border-radius:22px;padding:20px;margin-bottom:16px;}
        .wh-form-row{display:flex;gap:12px;margin-bottom:12px;}
        .wh-form-row .wh-form-group{flex:1;}
        .wh-goals-list{background:#fff;border-radius:22px;padding:20px;}
        .wh-empty-state{text-align:center;color:#666;padding:20px;}
        .wh-goal-card{background:#f8f8f8;border-radius:12px;padding:16px;margin-bottom:12px;border-left:4px solid #2196f3;}
        .wh-goal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
        .wh-goal-status{padding:4px 8px;border-radius:6px;font-size:10px;font-weight:600;}
        .wh-goal-status--active{background:#2196f3;color:#fff;}
        .wh-goal-status--completed{background:#4caf50;color:#fff;}
        .wh-progress-section{margin:12px 0;}
        .wh-progress-info{display:flex;justify-content:space-between;margin-bottom:8px;}
        .wh-progress-bar{height:8px;background:#e0e0e0;border-radius:4px;overflow:hidden;}
        .wh-progress-fill{height:100%;background:#4caf50;transition:width 0.3s ease;}
        .wh-goal-insights{margin-top:12px;padding-top:12px;border-top:1px solid #ddd;}
        .wh-insight-text{color:#1976d2;font-size:12px;margin-bottom:4px;}
        .wh-suggestion-text{color:#388e3c;font-size:12px;margin-bottom:4px;}
        .wh-deadline-info{color:#666;font-size:11px;}
        .wh-loading{text-align:center;padding:20px;color:#666;}
        .wh-goals-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}
        .wh-history-toggle{font-size:12px;padding:6px 12px;}
        .wh-statistics-card{background:#f8f8f8;border-radius:12px;padding:16px;margin-bottom:20px;}
        .wh-stats-grid{display:grid;grid-template-columns:repeat(2, 1fr);gap:12px;margin-bottom:16px;}
        .wh-stat-item{text-align:center;padding:12px;background:#fff;border-radius:8px;}
        .wh-stat-number{font-size:18px;font-weight:700;color:#2196f3;margin-bottom:4px;}
        .wh-stat-label{font-size:11px;color:#666;margin:0;}
        .wh-stats-summary{background:#e3f2fd;border-radius:8px;padding:12px;}
        .wh-stats-summary p{margin:4px 0;font-size:12px;}
        .wh-completed-goals{background:#fff;border-radius:22px;padding:20px;}
        .wh-goal-card--completed{border-left-color:#4caf50;background:#f1f8f9;}
        .wh-completion-details{margin-top:12px;padding-top:12px;border-top:1px solid #e0e0e0;}
        .wh-completion-details p{margin:6px 0;font-size:11px;}
        .wh-delete-btn{background:none;border:none;color:#d32f2f;cursor:pointer;padding:4px;border-radius:4px;font-size:14px;}
        .wh-delete-btn:hover{background:#ffebee;}
        .wh-motivational{background:#f8f8f8;border-radius:12px;padding:16px;margin-bottom:16px;text-align:center;}
        .wh-motivational-emoji{font-size:24px;margin-bottom:8px;display:block;}
        .wh-motivational-text{font-size:14px;color:#333;margin:0;}
        .wh-health-score{background:#fff;border-radius:22px;padding:20px;margin-bottom:16px;}
        .wh-score-display{text-align:center;margin-bottom:16px;}
        .wh-score-circle{width:80px;height:80px;border-radius:50%;margin:0 auto 12px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-weight:700;}
        .wh-score-number{font-size:24px;line-height:1;}
        .wh-score-label{font-size:10px;text-transform:uppercase;letter-spacing:1px;}
        .wh-advice-categories{background:#fff;border-radius:22px;padding:20px;margin-bottom:16px;}
        .wh-category-tabs{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;}
        .wh-category-tab{padding:8px 16px;border:1px solid #ddd;border-radius:8px;background:#f5f5f5;font-size:12px;cursor:pointer;transition:all 0.3s ease;}
        .wh-category-tab:hover{background:#e3f2fd;border-color:#2196f3;}
        .wh-category-tab--active{background:#2196f3;color:#fff;border-color:#1976d2;}
        .wh-personalized-advice{background:#fff;border-radius:22px;padding:20px;}
        .wh-advice-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;}
        .wh-refresh-btn{padding:6px 12px;font-size:12px;}
        .wh-advice-loading{text-align:center;padding:20px;}
        .wh-loading-spinner{width:24px;height:24px;border:3px solid #f3f3f3;border-top:3px solid #2196f3;border-radius:50%;margin:0 auto 12px;animation:spin 1s linear infinite;}
        @keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}
        .wh-advice-list{max-height:400px;overflow-y:auto;}
        .wh-advice-item{background:#f8f8f8;border-radius:12px;padding:16px;margin-bottom:12px;border-left:4px solid;transition:all 0.3s ease;}
        .wh-advice-item:hover{transform:translateX(4px);box-shadow:0 2px 8px rgba(0,0,0,0.1);}
        .wh-advice-item--pulse{animation:pulse 2s infinite;}
        .wh-advice-item--bounce{animation:bounce 1s ease-in-out;}
        .wh-advice-item--slideIn{animation:slideIn 0.5s ease-out;}
        .wh-advice-item--shake{animation:shake 0.5s;}
        .wh-advice-item--celebrate{animation:celebrate 1s ease-in-out;}
        .wh-advice-item--rotate{animation:rotate 0.5s ease-in-out;}
        .wh-advice-item--grow{animation:grow 0.5s ease-out;}
        .wh-advice-item--sparkle{animation:sparkle 1.5s ease-in-out;}
        .wh-advice-item--build{animation:build 0.8s ease-in-out;}
        @keyframes pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.05);}}
        @keyframes bounce{0%,20%,50%,80%,100%{transform:translateY(0);}40%{transform:translateY(-10px);}60%{transform:translateY(-5px);}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-20px);}to{opacity:1;transform:translateX(0);}}
        @keyframes shake{0%,100%{transform:translateX(0);}10%,30%,50%,70%,90%{transform:translateX(-2px);}20%,40%,60%,80%{transform:translateX(2px);}}
        @keyframes celebrate{0%{transform:scale(0.8) rotate(0deg);}50%{transform:scale(1.1) rotate(180deg);}100%{transform:scale(1) rotate(360deg);}}
        @keyframes rotate{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
        @keyframes grow{from{transform:scale(0.8);}to{transform:scale(1);}}
        @keyframes sparkle{0%,100%{opacity:1;}50%{opacity:0.5;transform:scale(1.1);}}
        @keyframes build{from{transform:scale(0.9) rotate(-2deg);}to{transform:scale(1) rotate(0deg);}}
        .wh-advice-header{display:flex;align-items:center;margin-bottom:12px;}
        .wh-advice-emoji{font-size:20px;margin-right:8px;}
        .wh-advice-title{margin:0;font-size:14px;font-weight:600;}
        .wh-advice-content{margin-top:8px;}
        .wh-advice-message{font-weight:500;margin-bottom:8px;color:#333;}
        .wh-advice-details{margin-top:8px;}
        .wh-advice-detailed{font-size:12px;color:#666;line-height:1.4;}
        .wh-logo img{width:140px;height:140px;border-radius:32px;object-fit:cover;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.2);transition:transform 0.3s ease;}
        .wh-logo img:hover{transform:scale(1.05);}
        .wh-header{display:flex;align-items:center;padding:16px 20px;background:#000;border-bottom:1px solid #333;}
        .wh-back-btn{background:none;border:none;color:#fff;font-size:24px;padding:8px;border-radius:4px;cursor:pointer;transition:background 0.3s ease;}
        .wh-back-btn:hover{background:#333;}
        .wh-title{font-size:18px;font-weight:700;color:#fff;margin:0;margin-left:12px;}
        .wh-content{padding:20px;max-height:calc(100vh - 140px);overflow-y:auto;}
        .wh-phone{width:375px;height:812px;background:#000;border-radius:40px;border:8px solid #222;box-shadow:0 10px 40px rgba(0,0,0,0.5);overflow:hidden;position:relative;}
        .wh-screen{position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;transform:translateX(100%);transition:all 0.3s ease;}
        .wh-screen--active{opacity:1;transform:translateX(0);}
        .wh-card{background:#1a1a1a;border-radius:20px;padding:20px;margin:16px;border:1px solid #333;box-shadow:0 4px 20px rgba(0,0,0,0.3);transition:transform 0.3s ease,box-shadow 0.3s ease;}
        .wh-card:hover{transform:translateY(-2px);box-shadow:0 6px 30px rgba(0,0,0,0.4);}
        .wh-input{width:100%;padding:12px 16px;background:#2a2a2a;border:1px solid #444;border-radius:8px;color:#fff;font-size:14px;transition:all 0.3s ease;}
        .wh-input:focus{outline:none;border-color:#fff;background:#333;box-shadow:0 0 0 2px rgba(255,255,255,0.1);}
        .wh-btn{width:100%;padding:14px 20px;background:#000;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;}
        .wh-btn:hover{background:#1a1a1a;border-color:#fff;transform:translateY(-1px);box-shadow:0 4px 12px rgba(255,255,255,0.1);}
        .wh-btn--primary{background:#fff;color:#000;border-color:#fff;}
        .wh-btn--primary:hover{background:#f0f0f0;color:#000;}
        .wh-btn--secondary{background:#2a2a2a;color:#fff;border-color:#444;}
        .wh-btn--secondary:hover{background:#333;border-color:#666;}
        .wh-submit{width:100%;padding:14px 20px;background:#fff;color:#000;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;}
        .wh-submit:hover{background:#f0f0f0;transform:translateY(-1px);box-shadow:0 4px 12px rgba(255,255,255,0.2);}
        .wh-submit:disabled{background:#666;color:#999;cursor:not-allowed;transform:none;box-shadow:none;}
        .wh-field{margin-bottom:16px;}
        .wh-label{display:block;margin-bottom:6px;color:#ccc;font-size:12px;font-weight:500;}
        .wh-error{color:#ff4444;font-size:12px;margin-top:8px;text-align:center;}
        .wh-hint{color:#999;font-size:11px;text-align:center;margin-top:8px;}
        .wh-center{text-align:center;}
        .wh-back{position:absolute;top:20px;left:20px;color:#fff;font-size:24px;cursor:pointer;padding:8px;border-radius:4px;transition:background 0.3s ease;}
        .wh-back:hover{background:#333;}
        .wh-user{font-size:48px;margin-bottom:12px;}
        .wh-home-title{font-size:22px;font-weight:700;color:#fff;margin-bottom:8px;}
        .wh-home-sub{font-size:14px;color:#999;margin-bottom:20px;}
        .wh-service{width:80%;margin:8px auto;padding:16px;background:#2a2a2a;border:1px solid #444;border-radius:12px;color:#fff;font-size:14px;font-weight:600;cursor:pointer;transition:all 0.3s ease;}
        .wh-service:hover{background:#333;border-color:#666;transform:translateY(-2px);box-shadow:0 4px 12px rgba(255,255,255,0.1);}
        .wh-top-bars{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:#000;border-bottom:1px solid #333;}
        .wh-time{color:#999;font-size:12px;}
        .wh-icons{display:flex;gap:8px;}
        .wh-icon{width:20px;height:20px;background:#333;border-radius:50%;}
        .wh-notch{width:120px;height:25px;background:#000;border-radius:0 0 20px 20px;margin:0 auto;border:1px solid #333;border-top:none;}
        .wh-form-group{margin-bottom:16px;}
        .wh-progress-bar{height:6px;background:#333;border-radius:3px;overflow:hidden;margin:8px 0;}
        .wh-progress-fill{height:100%;background:#fff;transition:width 0.5s ease;}
        .wh-loading{text-align:center;padding:20px;color:#999;}
        .wh-small-text{font-size:11px;color:#999;}
        .wh-empty-state{text-align:center;padding:40px 20px;color:#666;font-style:italic;}
        /* Responsive design */
        @media (max-width: 400px) {
          .wh-phone {
            width: 100%;
            height: 100vh;
            border-radius: 0;
            border: none;
          }
          .wh-content {
            padding: 16px;
          }
          .wh-logo {
            width: 50px;
            height: 50px;
          }
        }
        /* Smooth animations */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .wh-fade-in {
          animation: fadeIn 0.3s ease-out;
        }
        /* Enhanced focus states */
        .wh-input:focus, .wh-btn:focus, .wh-submit:focus {
          outline: 2px solid #fff;
          outline-offset: 2px;
        }
        /* Better borders and shadows */
        .wh-card, .wh-input, .wh-btn, .wh-submit {
          border: 1px solid #444;
        }
        .wh-card {
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
      `}</style>

      <div className="wh-phone">
        {/* LOGIN */}
        <div
          className={`wh-screen ${
            screen === "login" ? "wh-screen--active" : ""
          }`}
        >
          <div className="wh-top-bars">
            <div className="wh-bar" />
            <div className="wh-bar" />
            <div className="wh-bar" />
          </div>

          <div className="wh-center">
            <img src="/hook.png" alt="Wallet Hook" className="wh-logo" />
            <div className="wh-user">👤</div>
            <div className="wh-title">LOGIN</div>
          </div>

          <div className="wh-card">
            <form onSubmit={handleLogin}>
              <div className="wh-field">
                <input
                  type="email"
                  placeholder="Gmail"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                />
              </div>
              <div className="wh-field">
                <input
                  type="password"
                  placeholder="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
              </div>
              <div className="wh-links">
                <button
                  type="button"
                  className="wh-link-btn"
                  onClick={() => show("forgot")}
                >
                  forgot password
                </button>
                <button
                  type="button"
                  className="wh-link-btn"
                  onClick={() => show("create")}
                >
                  create account
                </button>
              </div>
              <button className="wh-submit" type="submit" disabled={authLoading}>
                {authLoading ? "Loading..." : "Submit"}
              </button>
              {authError && <p className="wh-error">{authError}</p>}
            </form>
          </div>
        </div>

        {/* CREATE ACCOUNT */}
        <div
          className={`wh-screen ${
            screen === "create" ? "wh-screen--active" : ""
          }`}
        >
          <div className="wh-center" style={{ marginTop: 16 }}>
            <div className="wh-user">👤</div>
            <div className="wh-title">CREATE ACCOUNT</div>
          </div>
          <div className="wh-card">
            <form onSubmit={handleSignup}>
              <div className="wh-field">
                <input
                  type="email"
                  placeholder="Gmail"
                  required
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                />
              </div>
              <div className="wh-field">
                <input
                  type="password"
                  placeholder="password"
                  required
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                />
              </div>
              <div className="wh-field">
                <input
                  type="password"
                  placeholder="Confirm password"
                  required
                  value={signupPassword2}
                  onChange={(e) => setSignupPassword2(e.target.value)}
                />
              </div>
              <div className="wh-small-text">
                already have an account{" "}
                <button
                  type="button"
                  className="wh-link-btn"
                  onClick={() => show("login")}
                >
                  Login
                </button>
              </div>
              <div style={{ marginTop: 16 }}>
                <button
                  className="wh-submit"
                  type="submit"
                  disabled={authLoading}
                >
                  {authLoading ? "Loading..." : "Submit"}
                </button>
              </div>
              {authError && <p className="wh-error">{authError}</p>}
            </form>
          </div>
        </div>

        {/* FORGOT PASSWORD */}
        <div
          className={`wh-screen ${
            screen === "forgot" ? "wh-screen--active" : ""
          }`}
        >
          <span className="wh-back" onClick={() => show("login")}>
            ←
          </span>
          <div className="wh-center" style={{ marginTop: 60 }}>
            <img src="/hook.png" alt="Wallet Hook" className="wh-logo" />
            <div className="wh-title">WALLET HOOK</div>
            <div className="wh-home-sub">Your Personal Finance Manager</div>
          </div>
          <div className="wh-card wh-forgot-card">
            <form onSubmit={handleForgot}>
              <div className="wh-field">
                <input
                  type="email"
                  placeholder="Gmail"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                />
              </div>
              <button
                className="wh-submit"
                type="submit"
                disabled={authLoading}
              >
                {authLoading ? "Loading..." : "Send Reset Email"}
              </button>
              {authError && <p className="wh-error">{authError}</p>}
            </form>
          </div>
        </div>

        {/* VERIFY */}
        <div
          className={`wh-screen ${
            screen === "verify" ? "wh-screen--active" : ""
          }`}
        >
          <span className="wh-back" onClick={() => show("login")}>
            ←
          </span>
          <div className="wh-center" style={{ marginTop: 60 }}>
            <div className="wh-user">✅</div>
            <div className="wh-title">CHECK EMAIL</div>
          </div>
          <div className="wh-card wh-verify-card">
            <p className="wh-small-text">
              Password reset email has been sent to {forgotEmail}. 
              Please check your inbox (and spam folder) and follow the link to reset your password.
            </p>
            <p className="wh-small-text" style={{ marginTop: 12, fontSize: '11px', color: '#666' }}>
              If you don't receive the email within a few minutes, please:
              <br />• Check your spam/junk folder
              <br />• Verify the email address is correct
              <br />• Try again or contact support
            </p>
            <button
              className="wh-submit"
              onClick={() => show("login")}
              style={{ marginTop: 24 }}
            >
              Back to Login
            </button>
          </div>
        </div>

        {/* HOME */}
        <div
          className={`wh-screen ${
            screen === "home" ? "wh-screen--active" : ""
          }`}
        >
          <div className="wh-home-wrap">
            <span className="wh-home-back" onClick={handleLogout}>
              ←
            </span>
            <div className="wh-home-circle" />
            <div className="wh-home-content">
              <div className="wh-home-title">WELCOME</div>
              <div className="wh-home-sub">SELECT THE SERVICE</div>

              {homePinHint && (
                <p className="wh-hint" style={{ color: "#b00020" }}>
                  {homePinHint}
                </p>
              )}
              {user && hasSafetyPin && (
                <p className="wh-hint">Safety PIN is set 🔐</p>
              )}

              <button
                type="button"
                className="wh-service"
                onClick={() => {
                  setPinError("");
                  setPinManageCurrent("");
                  setPinManageNew("");
                  setPinManageConfirm("");
                  show("pin_manage");
                }}
                style={{ background: "#5a5a5a", color: "#fff" }}
              >
                🔐 {hasSafetyPin ? "Change safety PIN" : "Set safety PIN"}
              </button>

              <button
                type="button"
                className="wh-service"
                onClick={() => openProtected("budgeting")}
              >
                BUDGETING
              </button>
              <button
                type="button"
                className="wh-service"
                onClick={() => openProtected("planning")}
              >
                PLANNING
              </button>
              <button
                type="button"
                className="wh-service"
                onClick={() => openProtected("savings")}
              >
                SAVINGS
              </button>
              <button
                type="button"
                className="wh-service"
                onClick={() => show("advice")}
              >
                ADVICES
              </button>

              <button
                type="button"
                className="wh-service"
                onClick={handleLogout}
                style={{ background: "#ff3b30", marginTop: 16 }}
              >
                🚪 Logout
              </button>
            </div>
          </div>
        </div>

        {/* PIN VERIFY (before Budgeting / Planning / Savings) */}
        <div
          className={`wh-screen ${
            screen === "pin_verify" ? "wh-screen--active" : ""
          }`}
        >
          <span className="wh-back" onClick={() => show("home")}>
            ←
          </span>
          <div className="wh-center" style={{ marginTop: 56 }}>
            <div className="wh-user">🔒</div>
            <div className="wh-title" style={{ fontSize: 20 }}>
              ENTER PIN
            </div>
            <p className="wh-small-text" style={{ textAlign: "center" }}>
              4-digit safety PIN
            </p>
          </div>
          <div className="wh-card wh-forgot-card">
            <form onSubmit={verifyPinAndEnter}>
              <div className="wh-field">
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  placeholder="••••"
                  autoComplete="off"
                  value={pinVerifyInput}
                  onChange={(e) =>
                    setPinVerifyInput(e.target.value.replace(/\D/g, "").slice(0, 4))
                  }
                />
              </div>
              <button className="wh-submit" type="submit" disabled={pinBusy}>
                {pinBusy ? "Checking..." : "Unlock"}
              </button>
              {pinError && <p className="wh-error">{pinError}</p>}
            </form>
          </div>
        </div>

        {/* PIN CREATE / CHANGE */}
        <div
          className={`wh-screen ${
            screen === "pin_manage" ? "wh-screen--active" : ""
          }`}
        >
          <span className="wh-back" onClick={() => show("home")}>
            ←
          </span>
          <div className="wh-center" style={{ marginTop: 48 }}>
            <div className="wh-user">🔐</div>
            <div className="wh-title" style={{ fontSize: 18 }}>
              {hasSafetyPin ? "CHANGE PIN" : "SET PIN"}
            </div>
          </div>
          <div className="wh-card wh-forgot-card">
            <form onSubmit={saveNewPin}>
              {hasSafetyPin && (
                <div className="wh-field">
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="Current PIN"
                    value={pinManageCurrent}
                    onChange={(e) =>
                      setPinManageCurrent(
                        e.target.value.replace(/\D/g, "").slice(0, 4)
                      )
                    }
                  />
                </div>
              )}
              <div className="wh-field">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="New PIN (4 digits)"
                  value={pinManageNew}
                  onChange={(e) =>
                    setPinManageNew(
                      e.target.value.replace(/\D/g, "").slice(0, 4)
                    )
                  }
                />
              </div>
              <div className="wh-field">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="Confirm new PIN"
                  value={pinManageConfirm}
                  onChange={(e) =>
                    setPinManageConfirm(
                      e.target.value.replace(/\D/g, "").slice(0, 4)
                    )
                  }
                />
              </div>
              <button className="wh-submit" type="submit" disabled={pinBusy}>
                {pinBusy ? "Saving..." : "Save PIN"}
              </button>
              {pinError && <p className="wh-error">{pinError}</p>}
            </form>
          </div>
        </div>

        {/* BUDGETING HUB (after PIN) */}
        <div
          className={`wh-screen ${
            screen === "budgeting_hub" ? "wh-screen--active" : ""
          }`}
        >
          <span className="wh-back" onClick={() => show("home")}>
            ←
          </span>
          <div className="wh-center" style={{ marginTop: 48, marginBottom: 12 }}>
            <div className="wh-user">📊</div>
            <div className="wh-title" style={{ fontSize: 20 }}>
              BUDGETING
            </div>
            <p className="wh-small-text" style={{ textAlign: "center" }}>
              Choose a tool
            </p>
          </div>
          <div className="wh-card wh-forgot-card" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="wh-hub-btn"
              onClick={() => {
                resetBudgetForm();
                show("budgeting");
              }}
            >
              Monthly budget calculator
            </button>
            <button
              type="button"
              className="wh-hub-btn"
              onClick={() => {
                setDailyLogDate(todayDateString());
                show("daily_logs");
              }}
            >
              Daily logs
            </button>
            <button
              type="button"
              className="wh-hub-btn"
              onClick={() => show("daily_logs_month")}
            >
              Log calendar (month)
            </button>
            <button
              type="button"
              className="wh-hub-btn"
              onClick={() => show("monthly_insights")}
            >
              Monthly summary &amp; insights
            </button>
          </div>
        </div>

        {/* BUDGETING — calculator */}
        <div
          className={`wh-screen ${
            screen === "budgeting" ? "wh-screen--active" : ""
          }`}
        >
          <span className="wh-back" onClick={() => show("budgeting_hub")}>
            ←
          </span>
          <div className="wh-center" style={{ marginTop: 44, marginBottom: 8 }}>
            <div className="wh-user">📊</div>
            <div className="wh-title" style={{ fontSize: 20 }}>
              BUDGETING
            </div>
          </div>

          {!budgetResult ? (
            <div
              className="wh-card wh-forgot-card"
              style={{ marginTop: 12, maxHeight: "72vh", overflow: "hidden" }}
            >
              <p
                className="wh-small-text"
                style={{ textAlign: "center", marginBottom: 12 }}
              >
                Enter your figures. Daily costs are converted to monthly (×
                {BUDGET_DAYS_PER_MONTH}).
              </p>
              <form onSubmit={handleBudgetSubmit} className="wh-budget-scroll">
                <div className="wh-field">
                  <label className="wh-label">1. Monthly income</label>
                  <input
                    className="wh-input-money"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={budgetMonthlyIncome}
                    onChange={(e) => setBudgetMonthlyIncome(e.target.value)}
                    required
                  />
                </div>
                <div className="wh-field">
                  <label className="wh-label">
                    2. Average daily food cost (→ monthly)
                  </label>
                  <input
                    className="wh-input-money"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={budgetAvgDailyFood}
                    onChange={(e) => setBudgetAvgDailyFood(e.target.value)}
                  />
                </div>
                <div className="wh-field">
                  <label className="wh-label">3. Monthly rent</label>
                  <input
                    className="wh-input-money"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={budgetMonthlyRent}
                    onChange={(e) => setBudgetMonthlyRent(e.target.value)}
                  />
                </div>
                <div className="wh-field">
                  <label className="wh-label">
                    4. Daily commute expenditure (→ monthly)
                  </label>
                  <input
                    className="wh-input-money"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={budgetDailyCommute}
                    onChange={(e) => setBudgetDailyCommute(e.target.value)}
                  />
                </div>
                <div className="wh-field">
                  <label className="wh-label">
                    5. Daily food expenditure (→ monthly)
                  </label>
                  <input
                    className="wh-input-money"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={budgetDailyFood}
                    onChange={(e) => setBudgetDailyFood(e.target.value)}
                  />
                </div>
                <div className="wh-field">
                  <label className="wh-label">
                    6. Accommodities expenditure (monthly)
                  </label>
                  <input
                    className="wh-input-money"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={budgetAccommodations}
                    onChange={(e) => setBudgetAccommodations(e.target.value)}
                  />
                </div>
                <div className="wh-field">
                  <label className="wh-label">7. Other (monthly)</label>
                  <input
                    className="wh-input-money"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={budgetOther}
                    onChange={(e) => setBudgetOther(e.target.value)}
                  />
                </div>
                {budgetError && (
                  <p className="wh-error" style={{ marginBottom: 8 }}>
                    {budgetError}
                  </p>
                )}
                <button className="wh-submit" type="submit" style={{ marginTop: 8 }}>
                  Calculate balance
                </button>
              </form>
            </div>
          ) : (
            <div className="wh-card wh-forgot-card" style={{ marginTop: 12 }}>
              <div className="wh-budget-result">
                <h4>Summary</h4>
                <div>
                  Monthly income (baseline):{" "}
                  <strong>{formatMoney(budgetResult.income)}</strong>
                </div>
                <div style={{ marginTop: 6 }}>
                  Total monthly expenditures:{" "}
                  <strong>{formatMoney(budgetResult.totalExpenses)}</strong>
                </div>
                <div style={{ marginTop: 6 }}>
                  Remaining balance:{" "}
                  <strong>{formatMoney(budgetResult.balance)}</strong> (
                  {budgetResult.income > 0
                    ? budgetResult.pctOfIncome.toFixed(1)
                    : "0"}
                  % of income)
                </div>
                <div
                  className={`wh-balance-pill ${
                    budgetResult.balance < 0
                      ? "wh-balance-risky"
                      : budgetResult.pctOfIncome >= 30
                        ? "wh-balance-highly"
                        : budgetResult.pctOfIncome >= 10
                          ? "wh-balance-moderate"
                          : "wh-balance-risky"
                  }`}
                >
                  {budgetResult.balanceLabel}
                </div>
                <details style={{ marginTop: 12 }}>
                  <summary style={{ cursor: "pointer" }}>Breakdown</summary>
                  <ul style={{ paddingLeft: 18, margin: "8px 0 0", fontSize: 11 }}>
                    <li>
                      Avg daily food → monthly:{" "}
                      {formatMoney(budgetResult.breakdown.monthlyFromAvgDailyFood)}
                    </li>
                    <li>Rent: {formatMoney(budgetResult.breakdown.rent)}</li>
                    <li>
                      Commute → monthly:{" "}
                      {formatMoney(budgetResult.breakdown.monthlyFromCommute)}
                    </li>
                    <li>
                      Daily food → monthly:{" "}
                      {formatMoney(budgetResult.breakdown.monthlyFromDailyFood)}
                    </li>
                    <li>
                      Accommodities:{" "}
                      {formatMoney(budgetResult.breakdown.accommodations)}
                    </li>
                    <li>Other: {formatMoney(budgetResult.breakdown.other)}</li>
                  </ul>
                </details>
                {budgetSaveStatus && (
                  <p
                    className="wh-small-text"
                    style={{
                      textAlign: "center",
                      marginTop: 10,
                      color: budgetSaveStatus.includes("Could not")
                        ? "#b00020"
                        : "#1b5e20",
                    }}
                  >
                    {budgetSaveStatus}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="wh-submit"
                style={{ marginTop: 16 }}
                onClick={() => {
                  setBudgetResult(null);
                  setBudgetSaveStatus("");
                }}
              >
                Edit inputs
              </button>
              <button
                type="button"
                className="wh-submit"
                style={{ marginTop: 10, background: "#555" }}
                onClick={() => show("home")}
              >
                Back to menu
              </button>
            </div>
          )}
        </div>

        {/* DAILY LOGS */}
        <div
          className={`wh-screen ${
            screen === "daily_logs" ? "wh-screen--active" : ""
          }`}
        >
          <span className="wh-back" onClick={() => show("budgeting_hub")}>
            ←
          </span>
          <div className="wh-center" style={{ marginTop: 40, marginBottom: 6 }}>
            <div className="wh-user">📝</div>
            <div className="wh-title" style={{ fontSize: 18 }}>
              DAILY LOGS
            </div>
          </div>
          <div className="wh-card wh-forgot-card" style={{ marginTop: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 10,
              }}
            >
              <button
                type="button"
                className="wh-link-btn"
                style={{ fontSize: 20 }}
                onClick={() =>
                  goToDailyLogDate(addDaysToDateString(dailyLogDate, -1))
                }
              >
                ◀
              </button>
              <input
                type="date"
                className="wh-input-money"
                value={dailyLogDate}
                onChange={(e) => goToDailyLogDate(e.target.value)}
                style={{ flex: 1, textAlign: "center" }}
              />
              <button
                type="button"
                className="wh-link-btn"
                style={{ fontSize: 20 }}
                onClick={() =>
                  goToDailyLogDate(addDaysToDateString(dailyLogDate, 1))
                }
              >
                ▶
              </button>
            </div>
            <p className="wh-small-text" style={{ textAlign: "center" }}>
              One log per day — multiple transactions inside.
            </p>
            {dailyLogLoading ? (
              <p className="wh-small-text">Loading…</p>
            ) : (
              <div className="wh-dl-scroll">
                {dailyLogEntries.length === 0 && (
                  <p className="wh-small-text" style={{ textAlign: "center" }}>
                    No entries yet.
                  </p>
                )}
                {dailyLogEntries.map((tx) => (
                  <div key={tx.id} className="wh-dl-row">
                    <div>
                      <span
                        className={
                          tx.type === "income" ? "wh-pill-in" : "wh-pill-ex"
                        }
                      >
                        {tx.type === "income" ? "In" : "Out"}
                      </span>{" "}
                      <strong>{tx.category}</strong> ·{" "}
                      {formatMoney(tx.amount)}
                      <small>{tx.note || "—"}</small>
                    </div>
                    <div>
                      <button
                        type="button"
                        className="wh-link-btn"
                        onClick={() => startEditTxn(tx)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="wh-link-btn"
                        onClick={() => removeTxn(tx.id)}
                      >
                        Del
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={submitNewTxn}>
              <div className="wh-field">
                <label className="wh-label">Amount</label>
                <input
                  className="wh-input-money"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={newTxnAmount}
                  onChange={(e) => setNewTxnAmount(e.target.value)}
                />
              </div>
              <div className="wh-field">
                <label className="wh-label">Category</label>
                <select
                  className="wh-input-money"
                  value={newTxnCategory}
                  onChange={(e) => setNewTxnCategory(e.target.value)}
                  style={{ width: "100%", padding: "10px" }}
                >
                  {TRANSACTION_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="wh-field">
                <label className="wh-label">Note</label>
                <input
                  className="wh-input-money"
                  type="text"
                  placeholder="Optional"
                  value={newTxnNote}
                  onChange={(e) => setNewTxnNote(e.target.value)}
                />
              </div>
              <div className="wh-field">
                <label className="wh-label">Type</label>
                <div style={{ display: "flex", gap: 12 }}>
                  <label className="wh-small-text">
                    <input
                      type="radio"
                      name="txtype"
                      checked={newTxnType === "expense"}
                      onChange={() => setNewTxnType("expense")}
                    />{" "}
                    Expense
                  </label>
                  <label className="wh-small-text">
                    <input
                      type="radio"
                      name="txtype"
                      checked={newTxnType === "income"}
                      onChange={() => setNewTxnType("income")}
                    />{" "}
                    Income
                  </label>
                </div>
              </div>
              {editingEntryId && (
                <button
                  type="button"
                  className="wh-link-btn"
                  onClick={cancelEditTxn}
                >
                  Cancel edit
                </button>
              )}
              <button className="wh-submit" type="submit">
                {editingEntryId ? "Update entry" : "Add entry"}
              </button>
            </form>
            <button
              type="button"
              className="wh-submit"
              style={{ marginTop: 12, background: "#333" }}
              onClick={saveDailyLogToCloud}
            >
              Save day to cloud
            </button>
            {dailyLogSaveMsg && (
              <p className="wh-small-text" style={{ textAlign: "center" }}>
                {dailyLogSaveMsg}
              </p>
            )}
          </div>
        </div>

        {/* LOG CALENDAR (month list) */}
        <div
          className={`wh-screen ${
            screen === "daily_logs_month" ? "wh-screen--active" : ""
          }`}
        >
          <span className="wh-back" onClick={() => show("budgeting_hub")}>
            ←
          </span>
          <div className="wh-center" style={{ marginTop: 44, marginBottom: 8 }}>
            <div className="wh-user">📅</div>
            <div className="wh-title" style={{ fontSize: 18 }}>
              LOG CALENDAR
            </div>
          </div>
          <div className="wh-card wh-forgot-card">
            <div className="wh-field">
              <label className="wh-label">Month</label>
              <input
                type="month"
                className="wh-input-money"
                value={monthListYM}
                onChange={(e) => setMonthListYM(e.target.value)}
              />
            </div>
            {monthListLoading ? (
              <p className="wh-small-text">Loading…</p>
            ) : (
              <div className="wh-dl-scroll" style={{ maxHeight: "50vh" }}>
                {monthListDays.length === 0 && (
                  <p className="wh-small-text">No logs this month.</p>
                )}
                {monthListDays.map((d) => {
                  const n = (d.entries || []).length;
                  const inc = (d.entries || []).filter(
                    (x) => x.type === "income"
                  ).length;
                  const exp = n - inc;
                  return (
                    <button
                      key={d.date}
                      type="button"
                      className="wh-dl-row"
                      style={{
                        width: "100%",
                        cursor: "pointer",
                        border: "none",
                        textAlign: "left",
                      }}
                      onClick={() => {
                        setDailyLogDate(d.date);
                        show("daily_logs");
                      }}
                    >
                      <span>
                        <strong>{d.date}</strong>
                        <small>
                          {n} txn · {inc} in · {exp} out
                        </small>
                      </span>
                      <span>→</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* MONTHLY INSIGHTS */}
        <div
          className={`wh-screen ${
            screen === "monthly_insights" ? "wh-screen--active" : ""
          }`}
        >
          <span className="wh-back" onClick={() => show("budgeting_hub")}>
            ←
          </span>
          <div className="wh-center" style={{ marginTop: 44, marginBottom: 8 }}>
            <div className="wh-user">📈</div>
            <div className="wh-title" style={{ fontSize: 18 }}>
              MONTHLY INSIGHTS
            </div>
          </div>
          <div className="wh-card wh-forgot-card">
            <div className="wh-field">
              <label className="wh-label">Month</label>
              <input
                type="month"
                className="wh-input-money"
                value={insightMonth}
                onChange={(e) => setInsightMonth(e.target.value)}
              />
            </div>
            {insightLoading ? (
              <p className="wh-small-text">Calculating…</p>
            ) : insightAgg ? (
              <>
                <div className="wh-budget-result">
                  <div>
                    Total income:{" "}
                    <strong>{formatMoney(insightAgg.totalIncome)}</strong>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    Total expenses:{" "}
                    <strong>{formatMoney(insightAgg.totalExpense)}</strong>
                  </div>
                  <div style={{ marginTop: 6 }}>
                    Net (savings / loss):{" "}
                    <strong>{formatMoney(insightAgg.net)}</strong>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <strong>By category</strong>
                    <ul
                      style={{
                        paddingLeft: 16,
                        fontSize: 11,
                        margin: "6px 0 0",
                      }}
                    >
                      {Object.entries(insightAgg.byCategory || {}).map(
                        ([cat, v]) => (
                          <li key={cat}>
                            {cat}: in {formatMoney(v.income)} · out{" "}
                            {formatMoney(v.expense)}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                </div>
                <div style={{ marginTop: 14 }}>
                  <strong className="wh-small-text">Insights</strong>
                  <ul
                    style={{
                      paddingLeft: 16,
                      fontSize: 11,
                      margin: "8px 0 0",
                    }}
                  >
                    {insightLines.map((line, i) => (
                      <li key={i} style={{ marginBottom: 6 }}>
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            ) : (
              <p className="wh-small-text">No data.</p>
            )}
          </div>
        </div>

        {/* PLANNING */}
        <div
          className={`wh-screen ${
            screen === "planning" ? "wh-screen--active" : ""
          }`}
        >
          <div className="wh-header">
            <button
              type="button"
              className="wh-back-btn"
              onClick={() => show("home")}
            >
              ‹
            </button>
            <h2 className="wh-title">PLANNING</h2>
          </div>

          <div className="wh-content">
            {!planningResult ? (
              <form onSubmit={handlePlanningSubmit} className="wh-form">
                <div className="wh-form-group">
                  <label className="wh-label">Goal Name</label>
                  <input
                    type="text"
                    className="wh-input"
                    placeholder="e.g., Buy a Car"
                    value={planningGoalName}
                    onChange={(e) => setPlanningGoalName(e.target.value)}
                    required
                  />
                </div>

                <div className="wh-form-group">
                  <label className="wh-label">Goal Type</label>
                  <select
                    className="wh-input"
                    value={planningGoalType}
                    onChange={(e) => setPlanningGoalType(e.target.value)}
                  >
                    <option value="car">Car</option>
                    <option value="property">Property</option>
                    <option value="jewelry">Jewelry</option>
                    <option value="travel">Travel</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div className="wh-form-group">
                  <label className="wh-label">Target Amount ($)</label>
                  <input
                    type="number"
                    className="wh-input"
                    placeholder="50000"
                    value={planningTargetAmount}
                    onChange={(e) => setPlanningTargetAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="wh-form-group">
                  <label className="wh-label">Current Savings ($)</label>
                  <input
                    type="number"
                    className="wh-input"
                    placeholder="5000"
                    value={planningCurrentSavings}
                    onChange={(e) => setPlanningCurrentSavings(e.target.value)}
                  />
                </div>

                <div className="wh-form-group">
                  <label className="wh-label">Monthly Income ($)</label>
                  <input
                    type="number"
                    className="wh-input"
                    placeholder="5000"
                    value={planningMonthlyIncome}
                    onChange={(e) => setPlanningMonthlyIncome(e.target.value)}
                    required
                  />
                </div>

                <div className="wh-form-group">
                  <label className="wh-label">Fixed Monthly Expenses ($)</label>
                  <input
                    type="number"
                    className="wh-input"
                    placeholder="2000"
                    value={planningFixedExpenses}
                    onChange={(e) => setPlanningFixedExpenses(e.target.value)}
                  />
                </div>

                <div className="wh-form-group">
                  <label className="wh-label">Variable Monthly Expenses ($)</label>
                  <input
                    type="number"
                    className="wh-input"
                    placeholder="1500"
                    value={planningVariableExpenses}
                    onChange={(e) => setPlanningVariableExpenses(e.target.value)}
                  />
                </div>

                <div className="wh-form-group">
                  <label className="wh-label">Timeframe (months, optional)</label>
                  <input
                    type="number"
                    className="wh-input"
                    placeholder="24"
                    value={planningTimeframe}
                    onChange={(e) => setPlanningTimeframe(e.target.value)}
                  />
                </div>

                <div className="wh-form-group">
                  <label className="wh-label">Priority</label>
                  <select
                    className="wh-input"
                    value={planningPriority}
                    onChange={(e) => setPlanningPriority(e.target.value)}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                {planningError && (
                  <div className="wh-error">{planningError}</div>
                )}

                <button
                  type="submit"
                  className="wh-btn wh-btn--primary"
                  disabled={planningLoading}
                >
                  {planningLoading ? "Calculating..." : "Generate Plans"}
                </button>
              </form>
            ) : (
              <div className="wh-planning-result">
                <div className="wh-result-header">
                  <h3>Planning Results</h3>
                  <button
                    type="button"
                    className="wh-btn wh-btn--secondary"
                    onClick={resetPlanningForm}
                  >
                    New Plan
                  </button>
                </div>

                <div className="wh-goal-summary">
                  <h4>{planningResult.goal_data.goal_name}</h4>
                  <p>
                    Target: ${planningResult.goal_data.target_amount.toLocaleString()} | 
                    Current: ${planningResult.goal_data.current_savings.toLocaleString()}
                  </p>
                  <p>
                    Monthly Savings Capacity: ${planningResult.savings_capacity.toLocaleString()}
                  </p>
                  {planningResult.time_to_goal_months !== null && (
                    <p>Time to Goal: {planningResult.time_to_goal_months} months</p>
                  )}
                  {planningResult.required_monthly_savings !== null && (
                    <p>
                      Required Monthly Savings: ${planningResult.required_monthly_savings.toLocaleString()} | 
                      Status: {planningResult.feasible ? "✅ Feasible" : "❌ Not Feasible"}
                    </p>
                  )}
                </div>

                {/* Market Analysis */}
                {planningResult.market_data && (
                  <div className="wh-market-analysis">
                    <h4>Market Analysis</h4>
                    <div className="wh-market-overview">
                      <p>
                        Market Average: ${planningResult.market_data.averagePrice.toLocaleString()}
                      </p>
                      <p>
                        Price Range: ${planningResult.market_data.priceRange.min.toLocaleString()} - ${planningResult.market_data.priceRange.max.toLocaleString()}
                      </p>
                      <p>
                        Market Trend: {planningResult.market_data.trends}
                      </p>
                    </div>
                    
                    {planningResult.deviation_analysis && (
                      <div className="wh-deviation-analysis">
                        <p className="wh-deviation-suggestion">
                          📊 {planningResult.deviation_analysis.suggestion}
                        </p>
                        <p>
                          Your target vs market: {planningResult.deviation_analysis.deviationPercent > 0 ? '+' : ''}{planningResult.deviation_analysis.deviationPercent.toFixed(1)}%
                        </p>
                      </div>
                    )}

                    {/* Car Recommendations */}
                    {planningResult.goal_data.goal_type === 'car' && planningResult.market_data.recommendations && planningResult.market_data.recommendations.length > 0 && (
                      <div className="wh-car-recommendations">
                        <h5>🚗 Recommended Cars in Your Range</h5>
                        {planningResult.market_data.recommendations.map((car, index) => (
                          <div key={index} className="wh-car-card">
                            <div className="wh-car-header">
                              <h6>{car.name}</h6>
                              <span className="wh-car-price">${car.price.toLocaleString()}</span>
                            </div>
                            <div className="wh-car-details">
                              <p>⭐ Rating: {car.rating}/5</p>
                              <p>⛽ Fuel: {car.fuel}</p>
                              <p>🔧 Reliability: {car.reliability}</p>
                              <p>💰 Value Score: {car.valueScore}</p>
                              {car.priceDifference !== 0 && (
                                <p className={car.priceDifference > 0 ? "wh-price-higher" : "wh-price-lower"}>
                                  {car.priceDifference > 0 ? '↑' : '↓'} ${Math.abs(car.priceDifference).toLocaleString()} ({car.priceDifferencePercent}%)
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="wh-plans">
                  <h4>Saving Plans</h4>
                  {planningResult.plans.map((plan) => (
                    <div key={plan.type} className={`wh-plan wh-plan--${plan.type}`}>
                      <div className="wh-plan-header">
                        <h5>{plan.name}</h5>
                        <span className={`wh-difficulty wh-difficulty--${plan.difficulty_level.toLowerCase()}`}>
                          {plan.difficulty_level}
                        </span>
                      </div>
                      <p>{plan.description}</p>
                      <div className="wh-plan-details">
                        <p>Monthly Saving: ${plan.monthly_saving.toLocaleString()}</p>
                        <p>Estimated Time: {plan.estimated_time} months</p>
                        <p>Status: {plan.feasibility}</p>
                        {plan.requires_expense_reduction && (
                          <p>⚠️ Requires expense reduction</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="wh-insights">
                  <h4>Insights & Suggestions</h4>
                  <div className="wh-insights-content">
                    <p>Savings Rate: {planningResult.insights.savings_rate}% of income</p>
                    {planningResult.insights.insights.map((insight, i) => (
                      <p key={i} className="wh-insight">💡 {insight}</p>
                    ))}
                    {planningResult.insights.suggestions.map((suggestion, i) => (
                      <p key={i} className="wh-suggestion">� {suggestion}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ADVICES */}
        <div
          className={`wh-screen ${
            screen === "advice" ? "wh-screen--active" : ""
          }`}
        >
          <div className="wh-header">
            <button
              type="button"
              className="wh-back-btn"
              onClick={() => show("home")}
            >
              ‹
            </button>
            <h2 className="wh-title">ADVICES</h2>
          </div>

          <div className="wh-content">
            {adviceLoading ? (
              <div className="wh-advice-loading">
                <div className="wh-loading-spinner"></div>
                <p>Generating personalized advice...</p>
              </div>
            ) : (
              <>
                {/* Financial Health Score */}
                <div className="wh-health-score">
                  <h4>Financial Health Score</h4>
                  <div className="wh-score-display">
                    <div 
                      className="wh-score-circle"
                      style={{
                        background: financialHealthScore >= 80 ? '#4caf50' : 
                                   financialHealthScore >= 60 ? '#ff9800' : '#f44336'
                      }}
                    >
                      <span className="wh-score-number">{financialHealthScore}</span>
                      <span className="wh-score-label">Score</span>
                    </div>
                    <p>{getHealthScoreDisplay(financialHealthScore).message}</p>
                  </div>
                </div>

                {/* Motivational Message */}
                {motivationalMessage && (
                  <div className="wh-motivational">
                    <span className="wh-motivational-emoji">{motivationalMessage.emoji}</span>
                    <p className="wh-motivational-text">{motivationalMessage.message}</p>
                  </div>
                )}

                {/* Advice Categories */}
                <div className="wh-advice-categories">
                  <h4>Advice Categories</h4>
                  <div className="wh-category-tabs">
                    {Object.values(ADVICE_CATEGORIES).map((category) => (
                      <button
                        key={category}
                        type="button"
                        className={`wh-category-tab ${
                          selectedAdviceCategory === category ? 'wh-category-tab--active' : ''
                        }`}
                        onClick={() => filterAdviceByCategory(category)}
                      >
                        {category.charAt(0).toUpperCase() + category.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Personalized Advice */}
                <div className="wh-personalized-advice">
                  <div className="wh-advice-header">
                    <h4>Personalized Advice</h4>
                    <button
                      type="button"
                      className="wh-btn wh-btn--secondary wh-refresh-btn"
                      onClick={refreshAdvice}
                    >
                      Refresh
                    </button>
                  </div>
                  
                  <div className="wh-advice-list">
                    {personalizedAdvices
                      .filter(advice => advice.category === selectedAdviceCategory)
                      .map((advice, index) => (
                        <div 
                          key={index}
                          className={`wh-advice-item wh-advice-item--${advice.animation}`}
                          style={{ borderLeftColor: advice.color }}
                        >
                          <div className="wh-advice-header">
                            <span className="wh-advice-emoji">{advice.emoji}</span>
                            <h5 className="wh-advice-title">{advice.title}</h5>
                          </div>
                          <div className="wh-advice-content">
                            <p className="wh-advice-message">{advice.message}</p>
                            {advice.detailedAdvice && (
                              <div className="wh-advice-details">
                                <p className="wh-advice-detailed">{advice.detailedAdvice}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    
                    {personalizedAdvices.filter(advice => advice.category === selectedAdviceCategory).length === 0 && (
                      <p className="wh-empty-state">No advice available for this category yet.</p>
                    )}
                  </div>
                </div>

                {/* Random Advice */}
                {advice && (
                  <div className="wh-card">
                    <h4>Daily Wisdom</h4>
                    <p className="wh-advice-text">{advice}</p>
                    <button
                      type="button"
                      className="wh-btn wh-btn--secondary"
                      onClick={fetchAdvice}
                      disabled={loadingAdvice}
                    >
                      {loadingAdvice ? "Loading..." : "New Advice"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div
          className={`wh-screen ${
            screen === "savings" ? "wh-screen--active" : ""
          }`}
        >
          <div className="wh-header">
            <button
              type="button"
              className="wh-back-btn"
              onClick={() => show("home")}
            >
              ‹
            </button>
            <h2 className="wh-title">SAVINGS</h2>
          </div>

          <div className="wh-content">
            {savingsLoading ? (
              <div className="wh-loading">Loading savings goals...</div>
            ) : (
              <>
                {/* Monthly Savings Suggestion */}
                {monthlySavingsSuggestion && (
                  <div className="wh-savings-suggestion">
                    <h4>💡 Monthly Savings Suggestion</h4>
                    <p><strong>Rs. {monthlySavingsSuggestion.suggested_amount.toLocaleString()}</strong></p>
                    <p className="wh-suggestion-message">{monthlySavingsSuggestion.message}</p>
                    <div className="wh-suggestion-details">
                      <p>Savings Capacity: Rs. {monthlySavingsSuggestion.savings_capacity.toLocaleString()}</p>
                      <p>Total Required: Rs. {monthlySavingsSuggestion.total_required.toLocaleString()}</p>
                      <p>Status: <span className={`wh-feasibility wh-feasibility--${monthlySavingsSuggestion.feasibility}`}>{monthlySavingsSuggestion.feasibility}</span></p>
                    </div>
                  </div>
                )}

                {/* Create New Goal Form */}
                <div className="wh-create-goal">
                  <h4>Create New Goal</h4>
                  <form onSubmit={handleCreateGoal} className="wh-form">
                    <div className="wh-form-row">
                      <div className="wh-form-group">
                        <label className="wh-label">Goal Name</label>
                        <input
                          type="text"
                          className="wh-input"
                          placeholder="e.g., Emergency Fund"
                          value={newGoalName}
                          onChange={(e) => setNewGoalName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="wh-form-group">
                        <label className="wh-label">Target Amount (Rs.)</label>
                        <input
                          type="number"
                          className="wh-input"
                          placeholder="50000"
                          value={newGoalTarget}
                          onChange={(e) => setNewGoalTarget(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="wh-form-row">
                      <div className="wh-form-group">
                        <label className="wh-label">Current Saved (Rs.)</label>
                        <input
                          type="number"
                          className="wh-input"
                          placeholder="0"
                          value={newGoalCurrent}
                          onChange={(e) => setNewGoalCurrent(e.target.value)}
                        />
                      </div>
                      <div className="wh-form-group">
                        <label className="wh-label">Deadline (optional)</label>
                        <input
                          type="date"
                          className="wh-input"
                          value={newGoalDeadline}
                          onChange={(e) => setNewGoalDeadline(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                        />
                      </div>
                    </div>
                    {savingsError && (
                      <div className="wh-error">{savingsError}</div>
                    )}
                    <button type="submit" className="wh-btn wh-btn--primary">
                      Create Goal
                    </button>
                  </form>
                </div>

                {/* Add Savings Form */}
                <div className="wh-add-savings">
                  <h4>Add Savings</h4>
                  <form onSubmit={handleAddSavings} className="wh-form">
                    <div className="wh-form-row">
                      <div className="wh-form-group">
                        <label className="wh-label">Select Goal</label>
                        <select
                          className="wh-input"
                          value={selectedGoalId}
                          onChange={(e) => setSelectedGoalId(e.target.value)}
                          required
                        >
                          <option value="">Choose a goal...</option>
                          {savingsGoals.map(goal => (
                            <option key={goal.id} value={goal.id}>
                              {goal.name} (Rs. {goal.target_amount.toLocaleString()})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="wh-form-group">
                        <label className="wh-label">Amount (Rs.)</label>
                        <input
                          type="number"
                          className="wh-input"
                          placeholder="1000"
                          value={addSavingsAmount}
                          onChange={(e) => setAddSavingsAmount(e.target.value)}
                          required
                        />
                      </div>
                    </div>
                    <div className="wh-form-group">
                      <label className="wh-label">Date</label>
                      <input
                        type="date"
                        className="wh-input"
                        value={addSavingsDate}
                        onChange={(e) => setAddSavingsDate(e.target.value)}
                        max={new Date().toISOString().split('T')[0]}
                        required
                      />
                    </div>
                    {savingsError && (
                      <div className="wh-error">{savingsError}</div>
                    )}
                    <button type="submit" className="wh-btn wh-btn--primary">
                      Add Savings
                    </button>
                  </form>
                </div>

                {/* Goals List */}
                <div className="wh-goals-list">
                  <div className="wh-goals-header">
                    <h4>Your Savings Goals</h4>
                    <button
                      type="button"
                      className="wh-btn wh-btn--secondary wh-history-toggle"
                      onClick={toggleGoalsHistory}
                    >
                      {showGoalsHistory ? '📊 Active Goals' : '📈 Goals History'}
                    </button>
                  </div>
                  
                  {showGoalsHistory ? (
                    // Goals History View
                    <>
                      {goalsStatistics && (
                        <div className="wh-statistics-card">
                          <h5>📊 Savings Statistics</h5>
                          <div className="wh-stats-grid">
                            <div className="wh-stat-item">
                              <p className="wh-stat-number">{goalsStatistics.total_goals}</p>
                              <p className="wh-stat-label">Total Goals</p>
                            </div>
                            <div className="wh-stat-item">
                              <p className="wh-stat-number">{goalsStatistics.active_goals}</p>
                              <p className="wh-stat-label">Active</p>
                            </div>
                            <div className="wh-stat-item">
                              <p className="wh-stat-number">{goalsStatistics.completed_goals}</p>
                              <p className="wh-stat-label">Completed</p>
                            </div>
                            <div className="wh-stat-item">
                              <p className="wh-stat-number">{goalsStatistics.completion_rate}%</p>
                              <p className="wh-stat-label">Success Rate</p>
                            </div>
                          </div>
                          <div className="wh-stats-summary">
                            <p>Total Saved: Rs. {goalsStatistics.total_saved.toLocaleString()}</p>
                            <p>Total Target: Rs. {goalsStatistics.total_target.toLocaleString()}</p>
                            <p>Overall Progress: {goalsStatistics.overall_progress}%</p>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    // Active Goals View
                    <>
                      <div className="wh-completed-goals">
                        <h5>🎉 Completed Goals</h5>
                        {completedGoals.length === 0 ? (
                          <p className="wh-empty-state">No completed goals yet.</p>
                        ) : (
                          completedGoals.map(goal => (
                            <div key={goal.id} className="wh-goal-card wh-goal-card--completed">
                              <div className="wh-goal-header">
                                <h5>{goal.name}</h5>
                                <span className="wh-goal-status wh-goal-status--completed">
                                  ✅ Completed
                                </span>
                                {goal.status !== 'deleted' && (
                                  <button
                                    type="button"
                                    className="wh-delete-btn"
                                    onClick={() => handleDeleteGoal(goal.id)}
                                    title="Delete completed goal"
                                  >
                                    🗑️
                                  </button>
                                )}
                              </div>
                              <div className="wh-completion-details">
                                <p>Target: Rs. {goal.target_amount.toLocaleString()}</p>
                                <p>Final Saved: Rs. {goal.total_saved.toLocaleString()}</p>
                                <p>Completed: {new Date(goal.completion_date).toLocaleDateString()}</p>
                                <p>Days Taken: {goal.days_to_complete} days</p>
                                <p>Transactions: {goal.transaction_count}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* LOGIN */}
        <div
          className={`wh-screen ${
            screen === "login" ? "wh-screen--active" : ""
          }`}
        >
          <div className="wh-top-bars">
            <div className="wh-bar" />
            <div className="wh-bar" />
            <div className="wh-bar" />
          </div>

          <div className="wh-center">
            <img src="/hook.png" alt="Wallet Hook" className="wh-logo" />
            <div className="wh-user">👤</div>
            <div className="wh-title">LOGIN</div>
          </div>

          <div className="wh-card">
            <form onSubmit={handleLogin}>
              <div className="wh-field">
                <input
                  type="email"
                  placeholder="Gmail"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                />
              </div>
              <div className="wh-field">
                <input
                  type="password"
                  placeholder="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                />
              </div>
              <div className="wh-links">
                <button
                  type="button"
                  className="wh-link-btn"
                  onClick={() => show("forgot")}
                >
                  forgot password
                </button>
                <button
                  type="button"
                  className="wh-link-btn"
                  onClick={() => show("create")}
                >
                  create account
                </button>
              </div>
              <button className="wh-submit" type="submit" disabled={authLoading}>
                {authLoading ? "Loading..." : "Submit"}
              </button>
              {authError && <p className="wh-error">{authError}</p>}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
