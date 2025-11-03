package com.project.plaque.plaque_calculator.service;

import com.project.plaque.plaque_calculator.model.FD;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Service for checking which normal form a relation satisfies
 * Based on functional dependencies
 */
@Service
public class NormalFormChecker {

    private final FDService fdService;

    public NormalFormChecker(FDService fdService) {
        this.fdService = fdService;
    }

    // Check all normal forms for a relation
    public String checkNormalForm(Set<String> attributes, List<FD> fds) {
        if (attributes == null || attributes.isEmpty()) {
            return "1NF"; // Empty relation is trivially in 1NF
        }

        // Assuming all relations are in 1NF (atomic values)
        // Check from highest to lowest - using comprehensive check for accuracy
        if (isBCNFComprehensive(attributes, fds)) {
            return "BCNF";
        }
        if (is3NF(attributes, fds)) {
            return "3NF";
        }
        if (is2NF(attributes, fds)) {
            return "2NF";
        }
        return "1NF";
    }

    // Check if relation is in 3NF
    public boolean is3NF(Set<String> attributes, List<FD> fds) {
        if (fds == null || fds.isEmpty()) {
            return true; // No FDs = 3NF
        }

        // Get transitive closure
        List<FD> transitiveFDs = fdService.findTransitiveFDs(fds);
        Set<FD> allFDs = new HashSet<>(fds);
        allFDs.addAll(transitiveFDs);
        List<FD> allFDsList = new ArrayList<>(allFDs);

        // Find all candidate keys (just check minimal superkeys)
        Set<Set<String>> candidateKeys = findCandidateKeys(attributes, allFDsList);

        for (FD fd : fds) {
            Set<String> lhs = fd.getLhs();
            Set<String> rhs = fd.getRhs();

            // Skip trivial dependencies
            if (lhs.containsAll(rhs)) {
                continue;
            }

            // Check if LHS is a superkey
            Set<String> closure = fdService.computeClosure(lhs, allFDsList);
            if (closure.containsAll(attributes)) {
                continue; // LHS is a superkey, ok for 3NF
            }

            // Check if all attributes in RHS-LHS are part of some candidate key
            Set<String> extraAttrs = new HashSet<>(rhs);
            extraAttrs.removeAll(lhs);

            for (String attr : extraAttrs) {
                boolean isPartOfKey = candidateKeys.stream()
                        .anyMatch(key -> key.contains(attr));
                if (!isPartOfKey) {
                    return false; // Attribute not part of any candidate key
                }
            }
        }

        return true;
    }

    // Check if relation is in 2NF
    public boolean is2NF(Set<String> attributes, List<FD> fds) {
        if (fds == null || fds.isEmpty()) {
            return true; // No FDs = 2NF
        }

        // Get transitive closure
        List<FD> transitiveFDs = fdService.findTransitiveFDs(fds);
        Set<FD> allFDs = new HashSet<>(fds);
        allFDs.addAll(transitiveFDs);
        List<FD> allFDsList = new ArrayList<>(allFDs);

        // Find candidate keys
        Set<Set<String>> candidateKeys = findCandidateKeys(attributes, allFDsList);
        if (candidateKeys.isEmpty()) {
            return true; // No keys identified, assume 2NF
        }

        // Find prime attributes (attributes that are part of any candidate key)
        Set<String> primeAttributes = new HashSet<>();
        candidateKeys.forEach(primeAttributes::addAll);

        // Check for partial dependencies
        for (FD fd : fds) {
            Set<String> lhs = fd.getLhs();
            Set<String> rhs = fd.getRhs();

            // Skip trivial dependencies
            if (lhs.containsAll(rhs)) {
                continue;
            }

            // Check if RHS contains any non-prime attribute
            Set<String> nonPrimeInRhs = new HashSet<>(rhs);
            nonPrimeInRhs.removeAll(primeAttributes);

            if (nonPrimeInRhs.isEmpty()) {
                continue; // All attributes in RHS are prime
            }

            // Check if LHS is a proper subset of any candidate key
            for (Set<String> key : candidateKeys) {
                if (key.containsAll(lhs) && !lhs.equals(key)) {
                    // LHS is a proper subset of a candidate key
                    // This is a partial dependency
                    return false;
                }
            }
        }
        return true;
    }

    // Find all candidate keys of a relation
    private Set<Set<String>> findCandidateKeys(Set<String> attributes, List<FD> allFDs) {
        Set<Set<String>> candidateKeys = new HashSet<>();

        // Start with all attributes as potential key
        Set<String> allAttrs = new HashSet<>(attributes);
        Set<String> closure = fdService.computeClosure(allAttrs, allFDs);

        if (!closure.containsAll(attributes)) {
            // Cannot determine all attributes from any subset
            return candidateKeys;
        }

        // Try to find minimal superkeys
        List<Set<String>> subsets = generateSubsets(attributes);
        subsets.sort(Comparator.comparingInt(Set::size));

        for (Set<String> subset : subsets) {
            closure = fdService.computeClosure(subset, allFDs);
            if (closure.containsAll(attributes)) {
                // This is a superkey, check if it's minimal
                boolean isMinimal = true;
                for (Set<String> existing : candidateKeys) {
                    if (subset.containsAll(existing)) {
                        isMinimal = false;
                        break;
                    }
                }
                if (isMinimal) {
                    // Remove any supersets already in candidateKeys
                    candidateKeys.removeIf(existing -> existing.containsAll(subset) && !existing.equals(subset));
                    candidateKeys.add(subset);
                }
            }
        }
        return candidateKeys;
    }

    /**
     * Check if relation is in BCNF (Primary comprehensive method)
     * Algorithm:
     * 1. Generate all non-empty subsets of attributes (2^n - 1)
     * 2. For each subset X:
     *    - Compute closure of X using transitive FDs
     *    - Check if X implies something non-trivial
     *    - If yes, verify that X is a superkey
     * 3. If any violation found, return false
     * This method is used for:
     * - Normal form badge display (UI)
     * - BCNF decomposition decisions (backend)
     * - All BCNF checks throughout the application
     *
     * @param attributes Set of attributes in the relation
     * @param fds List of functional dependencies (transitive closure computed internally)
     * @return true if relation is in BCNF, false otherwise
     */
    public boolean isBCNFComprehensive(Set<String> attributes, List<FD> fds) {
        if (attributes == null || attributes.isEmpty()) {
            return true; // Empty relation is trivially BCNF
        }

        if (fds == null || fds.isEmpty()) {
            return true; // No FDs = BCNF
        }

        // Ensure we have transitive closure
        List<FD> transitiveFDs = fdService.findTransitiveFDs(fds);
        Set<FD> allFDs = new HashSet<>(fds);
        allFDs.addAll(transitiveFDs);
        List<FD> allFdsForClosure = new ArrayList<>(allFDs);

        Set<String> allAttributes = new HashSet<>(attributes);
        List<String> attrList = new ArrayList<>(attributes);
        int n = attrList.size();

        // Check all non-empty subsets (2^n - 1)
        for (int mask = 1; mask < (1 << n); mask++) {
            Set<String> X = new LinkedHashSet<>();
            for (int i = 0; i < n; i++) {
                if ((mask & (1 << i)) != 0) {
                    X.add(attrList.get(i));
                }
            }

            // Skip if X equals entire relation (X = R)
            if (X.size() == allAttributes.size()) {
                continue;
            }

            // Compute closure of X
            Set<String> closureOfX = fdService.computeClosure(X, allFdsForClosure);

            // Restrict closure to current relation's attributes
            Set<String> closureRestrictedToRi = new HashSet<>(closureOfX);
            closureRestrictedToRi.retainAll(allAttributes);

            // Check if X implies something non-trivial
            Set<String> impliedNonTrivial = new HashSet<>(closureRestrictedToRi);
            impliedNonTrivial.removeAll(X);

            if (!impliedNonTrivial.isEmpty()) {
                // X implies something non-trivial
                // Check if X is a superkey (X+ ∩ R = R?)
                if (!closureRestrictedToRi.containsAll(allAttributes)) {
                    // X is not a superkey → BCNF violation
                    return false;
                }
            }
        }

        // All non-trivial determinants are superkeys
        return true;
    }

    // Generate all subsets of a set
    private List<Set<String>> generateSubsets(Set<String> set) {
        List<Set<String>> subsets = new ArrayList<>();
        List<String> list = new ArrayList<>(set);
        int n = list.size();

        for (int i = 0; i < (1 << n); i++) {
            Set<String> subset = new HashSet<>();
            for (int j = 0; j < n; j++) {
                if ((i & (1 << j)) > 0) {
                    subset.add(list.get(j));
                }
            }
            subsets.add(subset);
        }
        return subsets;
    }
}

