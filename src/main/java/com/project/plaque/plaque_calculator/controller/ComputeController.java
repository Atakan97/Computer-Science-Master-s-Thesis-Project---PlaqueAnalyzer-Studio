package com.project.plaque.plaque_calculator.controller;

import com.google.gson.Gson;
import com.project.plaque.plaque_calculator.model.FD;
import com.project.plaque.plaque_calculator.service.FDService;
import com.project.plaque.plaque_calculator.service.RicService;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import java.util.*;
import java.util.stream.Collectors;

@Controller
@RequestMapping("/compute")
public class ComputeController {

	private final FDService fdService;
	private final RicService ricService;
	private final Gson gson = new Gson();

	// Adding RicService in addition to FDService
	public ComputeController(FDService fdService, RicService ricService) {
		this.fdService = fdService;
		this.ricService = ricService;
	}

	@PostMapping
	public String compute(
			@RequestParam(required = false) String manualData,
			@RequestParam(required = false) String fds,
			@RequestParam(required = false, defaultValue = "false") boolean monteCarlo,
			@RequestParam(required = false, defaultValue = "50000") int samples,
			HttpSession session,
			Model model
	) {
		// Converting user's input to safe strings
		String safeManual = Optional.ofNullable(manualData).orElse("").trim();
		String safeFds = Optional.ofNullable(fds).orElse("").trim();

		// Call RicService (monteCarlo and samples forwarded)
		double[][] ricArr = new double[0][0];
		try {
			ricArr = ricService.computeRicFromManualData(safeManual, safeFds, monteCarlo, samples);
		} catch (Exception ex) {
			ex.printStackTrace();
			model.addAttribute("ricError", "RIC hesaplamasında hata: " + ex.getMessage());
		}

		// converting double[][] -> List<String[]> for model and session
		List<String[]> matrixForModel = new ArrayList<>();
		for (double[] row : ricArr) {
			String[] rowStr = new String[row.length];
			for (int i = 0; i < row.length; i++) {
				rowStr[i] = String.valueOf(row[i]);
			}
			matrixForModel.add(rowStr);
		}

		// Put matrix into session & model
		String originalTableJson = gson.toJson(matrixForModel);
		session.setAttribute("originalTableJson", originalTableJson);

		model.addAttribute("ricMatrix", matrixForModel);
		int ricColCount = matrixForModel.isEmpty() ? 0 : matrixForModel.get(0).length;
		model.addAttribute("ricColCount", ricColCount);
		model.addAttribute("ricJson", originalTableJson);

		// initialCalcTable (remove initial table from manualData)
		List<List<String>> initialCalcTable = Arrays.stream(
						safeManual.isEmpty() ? new String[0] : safeManual.split(";")
				)
				.filter(s -> s != null && !s.isEmpty())
				.map(row -> Arrays.stream(row.split(","))
						.map(String::trim)
						.collect(Collectors.toList()))
				.collect(Collectors.toList());

		String initJson = gson.toJson(initialCalcTable);
		session.setAttribute("initialCalcTableJson", initJson);

		// deduped originalTuples
		LinkedHashSet<String> seen = new LinkedHashSet<>();
		List<List<String>> dedupedOriginalTuples = new ArrayList<>();
		for (List<String> row : initialCalcTable) {
			List<String> cleaned = row.stream().map(s -> s == null ? "" : s.trim()).collect(Collectors.toList());
			String key = String.join("|", cleaned);
			if (seen.add(key)) {
				dedupedOriginalTuples.add(cleaned);
			}
		}
		session.setAttribute("originalTuples", dedupedOriginalTuples);

		// originalAttrOrder (first row values -> name/tag list)
		List<String> originalAttrOrder = new ArrayList<>();
		if (!safeManual.isEmpty()) {
			String firstRow = safeManual.split(";", 2)[0];
			originalAttrOrder = Arrays.stream(firstRow.split(","))
					.map(String::trim)
					.filter(s -> !s.isEmpty())
					.collect(Collectors.toList());
		}
		session.setAttribute("originalAttrOrder", originalAttrOrder);
		System.out.println("DEBUG: originalAttrOrder -> " + originalAttrOrder);

		// attribute indices
		List<Integer> originalAttrIndices = new ArrayList<>();
		for (int i = 0; i < originalAttrOrder.size(); i++) originalAttrIndices.add(i);
		session.setAttribute("originalAttrIndices", originalAttrIndices);
		System.out.println("DEBUG: originalAttrIndices -> " + originalAttrIndices);

		// store fdList in session
		session.setAttribute("fdList", safeFds);

		// parse and set originalFDs
		List<FD> originalFDs = parseFdsString(safeFds);
		session.setAttribute("originalFDs", originalFDs);

		// build fdListWithClosure (try/catch so it won't break UI on error)
		try {
			String fdListWithClosure = buildFdListWithClosure(safeFds, originalFDs, originalAttrOrder);
			session.setAttribute("fdListWithClosure", fdListWithClosure);
			System.out.println("DEBUG: fdListWithClosure -> " + fdListWithClosure);
		} catch (Exception ex) {
			ex.printStackTrace();
			session.setAttribute("fdListWithClosure", safeFds);
		}

		// model attributes for the view
		model.addAttribute("inputData", manualData);
		model.addAttribute("fdList", fds);

		return "calc";
	}

	// Convert(and parsing) a string like "A->B;C->D;E->F,G" to List<FD>
	private List<FD> parseFdsString(String fds) {
		if (fds == null || fds.isBlank()) {
			return Collections.emptyList();
		}
		List<FD> result = new ArrayList<>();
		for (String part : fds.split(";")) {
			String[] sides = part.split("->");
			if (sides.length != 2) continue;
			Set<String> lhs = Arrays.stream(sides[0].split(","))
					.map(String::trim)
					.filter(s -> !s.isEmpty())
					.collect(Collectors.toSet());
			Set<String> rhs = Arrays.stream(sides[1].split(","))
					.map(String::trim)
					.filter(s -> !s.isEmpty())
					.collect(Collectors.toSet());
			if (!lhs.isEmpty() && !rhs.isEmpty()) {
				result.add(new FD(lhs, rhs));
			}
		}
		return result;
	}

	// Helpers for FD closure-list generation
	private String normalizeFd(String s) {
		if (s == null) return "";
		String t = s.replace('→', '-').replaceAll("-+>", "->").trim();
		t = t.replaceAll("\\s*,\\s*", ",");    // remove spaces around commas
		t = t.replaceAll("\\s+", " ");         // normalize inner spaces
		return t;
	}

	// Returns a list by adding closure calculation to user FDs
	private String buildFdListWithClosure(String fds, List<FD> originalFDs, List<String> originalAttrOrder) {
		List<String> user = new ArrayList<>();
		if (fds != null && !fds.isBlank()) {
			for (String p : fds.split(";")) {
				String t = normalizeFd(p);
				if (!t.isEmpty()) user.add(t);
			}
		}

		LinkedHashSet<String> closureFds = new LinkedHashSet<>();
		int n = originalAttrOrder.size();
		for (int mask = 1; mask < (1 << Math.max(0, n)); mask++) {
			LinkedHashSet<String> X = new LinkedHashSet<>();
			for (int i = 0; i < n; i++) if ((mask & (1 << i)) != 0) X.add(originalAttrOrder.get(i));
			Set<String> clos = fdService.computeClosure(X, originalFDs);
			for (String a : clos) {
				if (!X.contains(a) && originalAttrOrder.contains(a)) {
					List<String> lhs = new ArrayList<>(X);
					Collections.sort(lhs);
					String fdStr = String.join(",", lhs) + "->" + a;
					closureFds.add(fdStr);
				}
			}
		}

		LinkedHashSet<String> merged = new LinkedHashSet<>();
		merged.addAll(user);
		merged.addAll(closureFds);
		return String.join(";", merged);
	}
}
