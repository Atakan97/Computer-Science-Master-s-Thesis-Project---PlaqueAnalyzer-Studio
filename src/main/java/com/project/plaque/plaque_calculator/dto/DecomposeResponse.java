package com.project.plaque.plaque_calculator.dto;

import java.util.List;

public class DecomposeResponse {
	private double[][] ricMatrix;
	private List<String> projectedFDs;

	// Constructor
	public DecomposeResponse(double[][] ricMatrix,
							 List<String> projectedFDs) {
		this.ricMatrix = ricMatrix;
		this.projectedFDs = projectedFDs;
	}

	// Getters & setters
	public double[][] getRicMatrix() {
		return ricMatrix;
	}
	public void setRicMatrix(double[][] ricMatrix) {
		this.ricMatrix = ricMatrix;
	}

	public List<String> getProjectedFDs() {
		return projectedFDs;
	}
	public void setProjectedFDs(List<String> projectedFDs) {
		this.projectedFDs = projectedFDs;
	}

}
