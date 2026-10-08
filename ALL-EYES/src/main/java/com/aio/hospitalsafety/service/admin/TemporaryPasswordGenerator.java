package com.aio.hospitalsafety.service.admin;

import org.springframework.stereotype.Component;

import java.security.SecureRandom;

@Component
public class TemporaryPasswordGenerator {
    private static final char[] UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ".toCharArray();
    private static final char[] LOWER = "abcdefghijkmnopqrstuvwxyz".toCharArray();
    private static final char[] DIGIT = "23456789".toCharArray();
    private static final char[] SYMBOL = "!@#$%".toCharArray();
    private static final char[] ALL = (new String(UPPER) + new String(LOWER)
            + new String(DIGIT) + new String(SYMBOL)).toCharArray();
    private static final int PASSWORD_LENGTH = 12;

    private final SecureRandom secureRandom = new SecureRandom();

    public String generate() {
        char[] password = new char[PASSWORD_LENGTH];
        password[0] = randomCharacter(UPPER);
        password[1] = randomCharacter(LOWER);
        password[2] = randomCharacter(DIGIT);
        password[3] = randomCharacter(SYMBOL);
        for (int index = 4; index < password.length; index++) {
            password[index] = randomCharacter(ALL);
        }
        shuffle(password);
        return new String(password);
    }

    private char randomCharacter(char[] candidates) {
        return candidates[secureRandom.nextInt(candidates.length)];
    }

    private void shuffle(char[] characters) {
        for (int index = characters.length - 1; index > 0; index--) {
            int swapIndex = secureRandom.nextInt(index + 1);
            char current = characters[index];
            characters[index] = characters[swapIndex];
            characters[swapIndex] = current;
        }
    }
}
