package arbodat.plus.service;

/**
 * Labels identify a research project (its name), a site within its research projects, a feature within
 * its site, a sample within its feature and an absolute dating (sub-sample) within its sample, ignoring
 * letter case (as the keys of ArboDat 2018). Thrown by LabelUniqueness, answered with 409 by the controllers.
 */
public class LabelTakenException extends RuntimeException {

    public LabelTakenException(String message) {
        super(message);
    }
}
