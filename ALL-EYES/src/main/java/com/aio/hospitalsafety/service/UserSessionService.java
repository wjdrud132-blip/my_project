package com.aio.hospitalsafety.service;

import com.aio.hospitalsafety.config.HospitalUserDetails;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.stereotype.Service;

@Service
public class UserSessionService {

    private final SessionRegistry sessionRegistry;

    public UserSessionService(SessionRegistry sessionRegistry) {
        this.sessionRegistry = sessionRegistry;
    }

    public void expireUserSessions(
            String hospitalId,
            String userId
    ) {
        for (Object principal : sessionRegistry.getAllPrincipals()) {
            if (!(principal instanceof HospitalUserDetails userDetails)) {
                continue;
            }

            boolean sameHospital =
                    userDetails.getHospitalId().equals(hospitalId);

            boolean sameUser =
                    userDetails.getUsername().equals(userId);

            if (!sameHospital || !sameUser) {
                continue;
            }

            for (SessionInformation session :
                    sessionRegistry.getAllSessions(principal, false)) {

                session.expireNow();
            }
        }
    }
}