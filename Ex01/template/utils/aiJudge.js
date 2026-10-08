const defaultThresholds = Object.freeze({
  dangerTemp: 60,
  warningTemp: 40,
  dangerSmoke: 230,
  warningSmoke: 150,
});

const GAS_GAP = 30;
const TEMP_GAP = 1.2;

function classifyWithHysteresis(smokeAvg, tempAvg, dangerScore, warningScore, prevStatus, thresholds) {
  const dangerUp = dangerScore >= 3;
  const warningUp = warningScore >= 1 || dangerUp;

  const dangerDown = smokeAvg < (thresholds.dangerSmoke - GAS_GAP) && tempAvg < (thresholds.dangerTemp - TEMP_GAP);
  const warningDown = smokeAvg < (thresholds.warningSmoke - GAS_GAP) && tempAvg < (thresholds.warningTemp - TEMP_GAP);

  if (prevStatus === "danger") {
    if (!dangerDown) return "danger";
    return warningDown ? "normal" : "warning";
  }
  if (prevStatus === "warning") {
    if (dangerUp) return "danger";
    return warningDown ? "normal" : "warning";
  }
  return dangerUp ? "danger" : warningUp ? "warning" : "normal";
}

function originalStatus(row) {
  if (row && row.alert_type === "danger") return "danger";
  if (row && row.alert_type === "warning") return "warning";
  return "normal";
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const numberValue = toNumber(value);
    if (numberValue !== null) return numberValue;
  }
  return null;
}

function parseSensorValues(row) {
  const msg = String((row && row.alert_msg) || "");
  const tempMatch = msg.match(/온도\s*([0-9.]+)/);
  const smokeMatch = msg.match(/연기\s*감지값\s*(\d+(?:\.\d+)?)/);
  const flameMatch = msg.match(/불꽃\s*감지\s*(0|1|O|X)/i);
  const flameText = flameMatch && String(flameMatch[1]).toUpperCase();

  return {
    temp: firstNumber(row && row.temp_value, row && row.temp, row && row.temperature, tempMatch && tempMatch[1]),
    smoke: firstNumber(row && row.smoke_value, row && row.gas, row && row.smoke, smokeMatch && smokeMatch[1]),
    flame: firstNumber(row && row.flame_value, row && row.flame, flameText === "O" ? 1 : flameText === "X" ? 0 : flameText),
    irCount: firstNumber(row && row.ir_count, row && row.irCount, row && row.flame_channel_count, row && row.ir_channel_count),
    prevTemp: firstNumber(row && row.prev_temp, row && row.prev_temp_value, row && row.prevTemperature),
    prevSmoke: firstNumber(row && row.prev_gas, row && row.prev_smoke_value, row && row.prevSmoke),
    prevIrCount: firstNumber(row && row.prev_ir_count, row && row.prevIrCount, row && row.prev_flame_channel_count),
  };
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function percentile(values, p) {
  const nums = values.map(toNumber).filter((value) => value !== null).sort((a, b) => a - b);
  if (!nums.length) return null;
  const index = Math.min(nums.length - 1, Math.max(0, Math.ceil((p / 100) * nums.length) - 1));
  return nums[index];
}

function avg(values) {
  const nums = values.map(toNumber).filter((value) => value !== null);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function midpoint(a, b, fallback) {
  return isNumber(a) && isNumber(b) ? (a + b) / 2 : fallback;
}

function normalizeRisk(value) {
  const risk = Number(value);
  if (risk === 2) return 2;
  if (risk === 1) return 1;
  return 0;
}

function stats(rows, field) {
  const values = rows.map((row) => row[field]);
  return {
    avg: avg(values),
    p75: percentile(values, 75),
    p90: percentile(values, 90),
    p95: percentile(values, 95),
  };
}

function positiveChangeThreshold(values, fallback) {
  const positives = values
    .map(toNumber)
    .filter((value) => value !== null && value > 0);
  const p90 = percentile(positives, 90);
  return isNumber(p90) && p90 > 0 ? p90 : fallback;
}

function irContext(sensor) {
  const irCount = sensor.irCount;
  const prevIrCount = sensor.prevIrCount;
  const hasIrCount = isNumber(irCount);
  const hasPrevIrCount = isNumber(prevIrCount);
  return {
    sunlightLike: hasIrCount && ((hasPrevIrCount && irCount >= 4 && prevIrCount >= 5) || (!hasPrevIrCount && prevIrCount >= 4)),
    shadeStable: hasIrCount && irCount === 0 && (!hasPrevIrCount || prevIrCount === 0),
  };
}

function sensorValuesFalling(sensor) {
  return {
    tempFalling: isNumber(sensor.temp) && isNumber(sensor.prevTemp) && sensor.temp < sensor.prevTemp,
    smokeFalling: isNumber(sensor.smoke) && isNumber(sensor.prevSmoke) && sensor.smoke < sensor.prevSmoke,
  };
}

function applyCoolingAdjustment(scores, reasons, sensor, dangerTemp, dangerSmoke) {
  const falling = sensorValuesFalling(sensor);
  if (!falling.tempFalling || !falling.smokeFalling) return scores;

  reasons.push("온도와 연기값이 이전 수신값보다 함께 감소해 화재가 약해지는 흐름을 반영했습니다.");

  const stillDanger =
    (isNumber(sensor.temp) && sensor.temp >= dangerTemp) ||
    (isNumber(sensor.smoke) && sensor.smoke >= dangerSmoke);

  if (stillDanger) {
    return {
      dangerScore: Math.max(0, scores.dangerScore - 1),
      warningScore: scores.warningScore + 1,
    };
  }

  return {
    dangerScore: Math.max(0, scores.dangerScore - 2),
    warningScore: Math.max(0, scores.warningScore - 1),
  };
}

function trainSensorModel(rows = [], thresholds = defaultThresholds) {
  const samples = rows
    .map((row) => ({
      bin_id: row.bin_id,
      temp: toNumber(row.temp),
      smoke: toNumber(row.gas ?? row.smoke),
      flame: toNumber(row.flame),
      ir_count: toNumber(row.ir_count),
      gas_change: toNumber(row.gas_change),
      temp_change: toNumber(row.temp_change),
      risk: row.fire_risk === null || row.fire_risk === undefined || row.fire_risk === "" ? null : normalizeRisk(row.fire_risk),
    }))
    .filter((row) => isNumber(row.temp) && isNumber(row.smoke));

  const labeledSamples = samples.filter((row) => row.risk !== null);
  const risk0 = labeledSamples.filter((row) => row.risk === 0);
  const risk1 = labeledSamples.filter((row) => row.risk === 1);
  const risk2 = labeledSamples.filter((row) => row.risk === 2);

  if (labeledSamples.length < 20 || new Set(labeledSamples.map((row) => row.risk)).size < 2) {
    return {
      available: false,
      sampleCount: labeledSamples.length,
      baselineSampleCount: samples.length,
      reason: "임계값 판단에 필요한 정상/주의/위험 구분이 부족해 기존 임계값 기준을 사용합니다.",
    };
  }

  const normalGas = stats(risk0, "smoke");
  const warningGas = stats(risk1, "smoke");
  const dangerGas = stats(risk2, "smoke");
  const normalTempStats = stats(risk0, "temp");
  const warningTempStats = stats(risk1, "temp");
  const dangerTempStats = stats(risk2, "temp");

  const warningSmoke = Math.max(thresholds.warningSmoke, midpoint(normalGas.p90, warningGas.p75, thresholds.warningSmoke));
  const dangerSmoke = Math.max(thresholds.dangerSmoke, warningSmoke + 1, midpoint(warningGas.p90, dangerGas.p75, thresholds.dangerSmoke));
  const warningTemp = Math.max(thresholds.warningTemp, midpoint(normalTempStats.p90, warningTempStats.p75, thresholds.warningTemp));
  const dangerTemp = Math.max(thresholds.dangerTemp, warningTemp + 1, midpoint(warningTempStats.p90, dangerTempStats.p75, thresholds.dangerTemp));

  const gasChangeP90 = positiveChangeThreshold(samples.map((row) => row.gas_change), 20);
  const tempChangeP90 = positiveChangeThreshold(samples.map((row) => row.temp_change), 2);

  const ambientSmokeLimit = Math.max(thresholds.warningSmoke, percentile(samples.map((row) => row.smoke), 75) ?? thresholds.warningSmoke);
  const ambientSamples = samples.filter((row) =>
    isNumber(row.temp) && row.temp > 0 && row.temp < 60 &&
    isNumber(row.smoke) && row.smoke > 0 && row.smoke <= ambientSmokeLimit
  );

  const byBin = new Map();
  for (const row of samples) {
    if (!byBin.has(row.bin_id)) byBin.set(row.bin_id, []);
    byBin.get(row.bin_id).push(row);
  }

  const binBaselines = {};
  for (const [binId, list] of byBin.entries()) {
    const ambientList = ambientSamples.filter((row) => row.bin_id === binId);
    const normalList = list.filter((row) => row.risk === 0 && row.temp > 0 && row.temp < 60);
    const validList = list.filter((row) => row.temp > 0 && row.temp < 60);
    const base = ambientList.length >= 20 ? ambientList : normalList.length >= 10 ? normalList : validList.length ? validList : list;
    binBaselines[binId] = {
      tempP95: percentile(base.map((row) => row.temp), 95),
      tempP99: percentile(base.map((row) => row.temp), 99),
      smokeP95: percentile(base.map((row) => row.smoke), 95),
      smokeP99: percentile(base.map((row) => row.smoke), 99),
      sampleCount: base.length,
    };
  }

  return {
    available: true,
    sampleCount: labeledSamples.length,
    baselineSampleCount: samples.length,
    warningSmoke,
    dangerSmoke,
    warningTemp,
    dangerTemp,
    fixedDangerSmoke: thresholds.dangerSmoke,
    fixedWarningSmoke: thresholds.warningSmoke,
    fixedDangerTemp: thresholds.dangerTemp,
    fixedWarningTemp: thresholds.warningTemp,
    gasChangeP90,
    tempChangeP90,
    binBaselines,
  };
}

function judgeWithModel(row, sensor, model, prevStatus) {
  const reasons = [];
  let dangerScore = 0;
  let warningScore = 0;

  const binBase = model.binBaselines && model.binBaselines[row.bin_id];
  const baselineSmokeP95 = binBase && isNumber(binBase.smokeP95) ? binBase.smokeP95 : null;
  const baselineTempP95 = binBase && isNumber(binBase.tempP95) ? binBase.tempP95 : null;
  const fixedWarningSmoke = isNumber(model.fixedWarningSmoke) ? model.fixedWarningSmoke : defaultThresholds.warningSmoke;
  const fixedDangerSmoke = isNumber(model.fixedDangerSmoke) ? model.fixedDangerSmoke : defaultThresholds.dangerSmoke;
  const fixedWarningTemp = isNumber(model.fixedWarningTemp) ? model.fixedWarningTemp : defaultThresholds.warningTemp;
  const fixedDangerTemp = isNumber(model.fixedDangerTemp) ? model.fixedDangerTemp : defaultThresholds.dangerTemp;

  const adaptiveWarningSmoke = Math.min(
  Math.max(model.warningSmoke, isNumber(baselineSmokeP95) ? baselineSmokeP95 + 10 : 0),
  fixedWarningSmoke
);

const adaptiveDangerSmoke = Math.min(
  Math.max(model.dangerSmoke, adaptiveWarningSmoke + 1),
  fixedDangerSmoke
);

const adaptiveWarningTemp = Math.min(
  Math.max(model.warningTemp, isNumber(baselineTempP95) ? baselineTempP95 + 6 : 0),
  fixedWarningTemp
);

const adaptiveDangerTemp = Math.min(
  Math.max(model.dangerTemp, adaptiveWarningTemp + 1),
  fixedDangerTemp
);
  const smoke = sensor.smoke;
  const temp = sensor.temp;
  const flame = sensor.flame;
  const gasChange = firstNumber(row.gas_change, row.smoke_change, 0);
  const tempChange = firstNumber(row.temp_change, 0);

  const GAS_CHANGE_FLOOR = 25;
  const TEMP_FIRE_CHANGE = 2;

  const modelGasChangeP90 = isNumber(model.gasChangeP90) ? model.gasChangeP90 : 0;
  const effectiveGasChangeP90 = Math.max(modelGasChangeP90, GAS_CHANGE_FLOOR);

  const gasChangeHigh =
    isNumber(gasChange) &&
    gasChange >= effectiveGasChangeP90;

  const tempChangeHigh =
    isNumber(tempChange) &&
    isNumber(model.tempChangeP90) &&
    model.tempChangeP90 > 0 &&
    tempChange >= model.tempChangeP90;

  const smokeWarningLike = isNumber(smoke) && smoke >= adaptiveWarningSmoke;

  const tempChangeSmall =
    !isNumber(tempChange) || tempChange < TEMP_FIRE_CHANGE;

  const gasRiseModerate =
    isNumber(gasChange) &&
    gasChange > 0 &&
    gasChange < GAS_CHANGE_FLOOR;

  const smokeNotDanger =
    !isNumber(smoke) || smoke < adaptiveDangerSmoke;

  const smokeOnlyWatch =
    gasRiseModerate &&
    tempChangeSmall &&
    smokeNotDanger &&
    flame !== 1;


  if (smokeOnlyWatch) {
    return {
      status: "normal",
      reason: [
        "연기값은 증가했지만 온도 상승 변화량이 크지 않아 담배연기 또는 일시적 연기 가능성으로 관찰합니다."
      ],
      confidence: 55,
    };
  }
  const ir = irContext(sensor);

  const flameIsUseful = flame === 1 && !ir.sunlightLike && (
    ir.shadeStable ||
    smokeWarningLike ||
    (isNumber(temp) && temp >= adaptiveDangerTemp && isNumber(smoke) && smoke >= adaptiveWarningSmoke * 0.8) ||
    gasChangeHigh ||
    tempChangeHigh
  );

  if (isNumber(smoke)) {
    if (smoke >= adaptiveDangerSmoke) {
      dangerScore += 3;
      reasons.push("임계값 기준으로 연기값이 위험 구간에 있습니다.");
    } else if (smokeWarningLike) {
      warningScore += 2;
      reasons.push("임계값 기준으로 연기값이 주의 구간에 있습니다.");
    }
  }

  if (isNumber(temp)) {
    if (temp >= adaptiveDangerTemp) {
      if (smokeWarningLike || flameIsUseful || gasChangeHigh || tempChangeHigh) {
        dangerScore += 2;
        reasons.push("온도가 위험 구간이고 연기값 또는 센서 변화가 함께 감지되었습니다.");
      } else {
        warningScore += 1;
        reasons.push("온도는 높지만 연기값이 낮아 햇빛/주변 환경 가능성을 고려해 주의로 관찰합니다.");
      }
    } else if (temp >= adaptiveWarningTemp) {
      warningScore += 1;
      reasons.push("임계값 기준으로 온도가 평소보다 높은 구간입니다.");
    }
  }

  if (gasChangeHigh) {
    warningScore += 1;
    reasons.push("연기값 증가폭이 학습 데이터의 상위 구간에 있습니다.");
  }

  if (tempChangeHigh) {
    warningScore += 1;
    reasons.push("온도 증가폭이 학습 데이터의 상위 구간에 있습니다.");
  }

  if (flameIsUseful) {
    dangerScore += ir.shadeStable ? 3 : 2;
    reasons.push(ir.shadeStable ? "IR 감지 개수가 0으로 유지되어 불꽃 감지를 더 중요한 위험 근거로 반영했습니다." : "불꽃 감지는 연기값 또는 온도 상승이 동반되어 위험 판단에 반영했습니다.");
  } else if (flame === 1) {
    reasons.push(ir.sunlightLike ? "IR 다채널 감지가 지속되어 햇빛 가능성을 고려하고 불꽃 단독 가중치를 낮췄습니다." : "불꽃 감지가 있었지만 연기값/온도 상승이 약해 단독 위험 근거로는 사용하지 않았습니다.");
  }

  ({ dangerScore, warningScore } = applyCoolingAdjustment(
    { dangerScore, warningScore },
    reasons,
    sensor,
    adaptiveDangerTemp,
    adaptiveDangerSmoke
  ));

  const effectiveThresholds = {
    dangerSmoke: adaptiveDangerSmoke,
    warningSmoke: adaptiveWarningSmoke,
    dangerTemp: adaptiveDangerTemp,
    warningTemp: adaptiveWarningTemp,
  };
  const status = classifyWithHysteresis(smoke, temp, dangerScore, warningScore, prevStatus, effectiveThresholds);

  if (status === "normal") {
    reasons.push("임계값 기준으로 정상 범위입니다.");
  }

  return {
    status,
    reason: reasons,
    confidence: Math.min(99, 62 + dangerScore * 9 + warningScore * 5),
  };
}

function judgeDanger(row, thresholds = defaultThresholds, enabled = true, model = null, prevStatus = "normal") {
  const sensor = parseSensorValues(row || {});
  const baseStatus = originalStatus(row || {});

  if (!enabled) {
    return {
      status: baseStatus,
      reason: ["AI 판단이 비활성화되어 기존 임계값 기준을 사용합니다."],
      sensor,
      confidence: 0,
    };
  }

  if (model && model.available) {
    const judged = judgeWithModel(row || {}, sensor, model, prevStatus);
    return {
      ...judged,
      sensor,
      model_sample_count: model.sampleCount,
    };
  }

  const reasons = [];
  let dangerScore = 0;
  let warningScore = 0;
  const ir = irContext(sensor);

  const flameUsable = sensor.flame === 1 && !ir.sunlightLike && (
    ir.shadeStable ||
    (isNumber(sensor.smoke) && sensor.smoke >= thresholds.warningSmoke) ||
    (isNumber(sensor.temp) && sensor.temp >= thresholds.warningTemp)
  );

  if (flameUsable) {
    dangerScore += 4;
    reasons.push(ir.shadeStable ? "IR 감지 개수가 0으로 유지되어 불꽃 감지를 중요한 위험 근거로 반영했습니다." : "불꽃이 감지되고 연기값 또는 온도 상승이 동반되어 위험으로 판단했습니다.");
  } else if (sensor.flame === 1) {
    reasons.push(ir.sunlightLike ? "IR 다채널 감지가 지속되어 햇빛 가능성을 고려하고 불꽃 단독 가중치를 낮췄습니다." : "불꽃 감지가 있었지만 연기값/온도 상승이 약해 단독 위험 근거로는 사용하지 않았습니다.");
  }

  if (isNumber(sensor.smoke)) {
    if (sensor.smoke >= thresholds.dangerSmoke) {
      dangerScore += 3;
      reasons.push("연기 감지값이 위험 기준을 초과했습니다.");
    } else if (sensor.smoke >= thresholds.warningSmoke) {
      warningScore += 2;
      reasons.push("연기 감지값이 주의 기준을 초과했습니다.");
    }
  }

  if (isNumber(sensor.temp)) {
    if (sensor.temp >= thresholds.dangerTemp) {
      dangerScore += 3;
      reasons.push("온도가 위험 기준을 초과했습니다.");
    } else if (sensor.temp >= thresholds.warningTemp) {
      warningScore += 1;
      reasons.push("온도가 주의 기준을 초과했습니다.");
    }
  }

  if (
    isNumber(sensor.temp) &&
    isNumber(sensor.smoke) &&
    sensor.temp >= thresholds.warningTemp &&
    sensor.smoke >= thresholds.warningSmoke
  ) {
    warningScore += 1;
    reasons.push("온도와 연기값이 동시에 상승해 위험 가능성이 있습니다.");
  }

  const hardDanger =
    (isNumber(sensor.smoke) && sensor.smoke >= thresholds.dangerSmoke) ||
    (isNumber(sensor.temp) && sensor.temp >= thresholds.dangerTemp) ||
    flameUsable;

  if (!hardDanger) {
    ({ dangerScore, warningScore } = applyCoolingAdjustment(
      { dangerScore, warningScore },
      reasons,
      sensor,
      thresholds.dangerTemp,
      thresholds.dangerSmoke
    ));
  }

 const status = classifyWithHysteresis(sensor.smoke, sensor.temp, dangerScore, warningScore, prevStatus, thresholds);

  if (status === "normal") {
    if (!isNumber(sensor.temp) && !isNumber(sensor.smoke) && !isNumber(sensor.flame)) {
      reasons.push("최근 센서 데이터가 아직 없습니다.");
    } else {
      reasons.push("온도, 연기, 불꽃 값이 정상 범위입니다.");
    }
  }

  return {
    status,
    reason: reasons,
    sensor,
    confidence: Math.min(99, 60 + dangerScore * 10 + warningScore * 6),
  };
}

module.exports = {
  defaultThresholds,
  judgeDanger,
  parseSensorValues,
  trainSensorModel,
};






