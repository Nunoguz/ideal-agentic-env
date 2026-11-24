package com.example.library.lending;

import jakarta.validation.constraints.Positive;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

@ConfigurationProperties("library.lending")
@Validated
public record LendingProperties(@Positive int maxLoans) {}
